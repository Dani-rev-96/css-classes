import type { CssClassDefinition, CssClassesConfig, ScssDirectives, ScssMixin, ScssExtend, ScssInclude } from "../types.js";
import { parseCssClasses, extractStyleBlocks, parseScssDirectives } from "../parsers/css-parser.js";
import { tsParseCssClasses } from "../parsers/treesitter/index.js";
import { scanWorkspace, scanTemplateFiles, readFileContent } from "../scanner/workspace-scanner.js";
import { resolveFileImports } from "./import-resolver.js";
import { findSourceMap, resolveOriginalPosition } from "../utils/sourcemap.js";

/**
 * In-memory index of all CSS class definitions across the workspace.
 * Provides O(1) lookup by class name.
 */
export class CssClassIndex {
  /** Map from class name -> list of definitions */
  private index = new Map<string, CssClassDefinition[]>();

  /** Map from file path -> list of class names defined in that file */
  private fileIndex = new Map<string, Set<string>>();

  /** SCSS mixin definitions indexed by name */
  private mixinIndex = new Map<string, ScssMixin[]>();

  /** @extend relationships indexed by target class name */
  private extendIndex = new Map<string, ScssExtend[]>();

  /** @include usages indexed by mixin name */
  private includeIndex = new Map<string, ScssInclude[]>();

  /** Map from file path -> SCSS directives in that file */
  private fileDirectives = new Map<string, ScssDirectives>();

  /** Configuration */
  private config: CssClassesConfig;

  constructor(config: CssClassesConfig) {
    this.config = config;
  }

  /**
   * Get all definitions for a given class name.
   */
  lookup(className: string): CssClassDefinition[] {
    return this.index.get(className) ?? [];
  }

  /**
   * Get all indexed class names.
   */
  allClassNames(): string[] {
    return Array.from(this.index.keys());
  }

  /**
   * Get total number of indexed classes.
   */
  get size(): number {
    return this.index.size;
  }

  /**
   * Look up mixin definitions by name.
   */
  lookupMixin(name: string): ScssMixin[] {
    return this.mixinIndex.get(name) ?? [];
  }

  /**
   * Get all @extend relationships where the given class is the target.
   */
  lookupExtenders(className: string): ScssExtend[] {
    return this.extendIndex.get(className) ?? [];
  }

  /**
   * Get all @include usages of a mixin by name.
   */
  lookupIncludes(mixinName: string): ScssInclude[] {
    return this.includeIndex.get(mixinName) ?? [];
  }

  /**
   * Get all mixin names in the index.
   */
  allMixinNames(): string[] {
    return Array.from(this.mixinIndex.keys());
  }

  /**
   * Get total number of definitions (including duplicates across files).
   */
  get totalDefinitions(): number {
    let count = 0;
    for (const defs of this.index.values()) {
      count += defs.length;
    }
    return count;
  }

  /**
   * Parse CSS classes from content, using tree-sitter for .css files when enabled,
   * falling back to regex for .scss files or when tree-sitter is disabled.
   *
   * @param langHint — optional language hint (e.g. from a `<style lang="scss">` block)
   *   that overrides file-extension-based detection.
   */
  private async parseClasses(
    content: string,
    filePath: string,
    langHint?: string,
  ): Promise<CssClassDefinition[]> {
    const isScss = langHint === "scss" || langHint === "sass" || filePath.endsWith(".scss");
    if (this.config.experimentalTreeSitter && !isScss) {
      try {
        return await tsParseCssClasses(content, filePath, this.config);
      } catch {
        // Fall back to regex parser on tree-sitter failure
      }
    }
    return parseCssClasses(content, filePath, this.config);
  }

  /**
   * Fully re-index the workspace by scanning all CSS/SCSS files.
   * Follows @import/@use/@forward chains to include referenced files.
   */
  async indexWorkspace(workspaceRoot: string): Promise<void> {
    const files = await scanWorkspace(workspaceRoot, this.config);

    this.index.clear();
    this.fileIndex.clear();
    this.mixinIndex.clear();
    this.extendIndex.clear();
    this.includeIndex.clear();
    this.fileDirectives.clear();

    // Index all directly-found files
    const results = await Promise.all(
      files.map(async (filePath) => {
        const content = await readFileContent(filePath);
        if (!content) return { classes: [] as CssClassDefinition[], content: null, filePath };
        const classes = await this.parseClasses(content, filePath);
        return { classes, content, filePath };
      }),
    );

    const indexedPaths = new Set(files);
    const importQueue: Array<{ filePath: string; content: string }> = [];

    for (const { classes, content, filePath } of results) {
      for (const def of classes) {
        this.addDefinition(def);
      }
      if (content) {
        this.indexDirectives(filePath, content);
        importQueue.push({ filePath, content });
      }
    }

    // Follow import chains (BFS, avoids cycles via indexedPaths)
    while (importQueue.length > 0) {
      const batch = importQueue.splice(0, importQueue.length);
      const importResults = await Promise.all(
        batch.map(async ({ filePath, content }) => {
          const imports = await resolveFileImports(content, filePath);
          return imports
            .filter((imp) => imp.resolvedPath && !indexedPaths.has(imp.resolvedPath))
            .map((imp) => imp.resolvedPath!);
        }),
      );

      const newFiles = importResults.flat();
      for (const newFile of newFiles) {
        if (indexedPaths.has(newFile)) continue;
        indexedPaths.add(newFile);

        const content = await readFileContent(newFile);
        if (!content) continue;

        const classes = await this.parseClasses(content, newFile);
        for (const def of classes) {
          this.addDefinition(def);
        }
        this.indexDirectives(newFile, content);
        importQueue.push({ filePath: newFile, content });
      }
    }

    // Index embedded <style> blocks from template files (Vue, HTML, etc.)
    if (this.config.searchEmbeddedStyles) {
      const templateFiles = await scanTemplateFiles(workspaceRoot, this.config);
      await Promise.all(
        templateFiles.map(async (filePath) => {
          const content = await readFileContent(filePath);
          if (!content) return;
          await this.indexEmbeddedStyles(filePath, content);
        }),
      );
    }
  }

  /**
   * Index a single file (e.g. on file change/create).
   * If the file has an associated source map, definitions are resolved
   * back to their original source positions.
   */
  async indexFile(filePath: string, content?: string): Promise<void> {
    // Remove old entries for this file
    this.removeFile(filePath);

    const fileContent = content ?? (await readFileContent(filePath));
    if (!fileContent) return;

    const classes = await this.parseClasses(fileContent, filePath);

    // Check for source map and resolve original positions
    const sourceMap = await findSourceMap(filePath, fileContent);

    for (const def of classes) {
      if (sourceMap) {
        const original = resolveOriginalPosition(
          sourceMap.map,
          def.line,
          def.column,
          sourceMap.mapFilePath,
        );
        if (original) {
          this.addDefinition({
            ...def,
            filePath: original.originalFilePath,
            line: original.originalLine,
            column: original.originalColumn,
            endLine: original.originalLine,
            endColumn: original.originalColumn + def.className.length,
          });
          continue;
        }
      }
      this.addDefinition(def);
    }
    this.indexDirectives(filePath, fileContent);
  }

  /**
   * Index embedded <style> blocks from Vue/Svelte/HTML files.
   */
  async indexEmbeddedStyles(filePath: string, content: string): Promise<void> {
    const blocks = extractStyleBlocks(content);
    for (const block of blocks) {
      const classes = await this.parseClasses(block.content, filePath, block.lang);
      for (const def of classes) {
        // Adjust line numbers for the style block offset
        this.addDefinition({
          ...def,
          line: def.line + block.lineOffset,
          endLine: def.endLine + block.lineOffset,
        });
      }
    }
  }

  /**
   * Remove all definitions from a specific file.
   */
  removeFile(filePath: string): void {
    const classNames = this.fileIndex.get(filePath);
    if (classNames) {
      for (const className of classNames) {
        const defs = this.index.get(className);
        if (defs) {
          const filtered = defs.filter((d) => d.filePath !== filePath);
          if (filtered.length > 0) {
            this.index.set(className, filtered);
          } else {
            this.index.delete(className);
          }
        }
      }
      this.fileIndex.delete(filePath);
    }

    this.removeDirectives(filePath);
  }

  /**
   * Add a single definition to the index.
   */
  private addDefinition(def: CssClassDefinition): void {
    const existing = this.index.get(def.className) ?? [];
    existing.push(def);
    this.index.set(def.className, existing);

    const fileClasses = this.fileIndex.get(def.filePath) ?? new Set();
    fileClasses.add(def.className);
    this.fileIndex.set(def.filePath, fileClasses);
  }

  /**
   * Update the configuration (triggers re-index needed).
   */
  updateConfig(config: CssClassesConfig): void {
    this.config = config;
  }

  /**
   * Index SCSS directives (@mixin, @extend, @include) for a file.
   */
  private indexDirectives(filePath: string, content: string): void {
    const directives = parseScssDirectives(content, filePath);
    this.fileDirectives.set(filePath, directives);

    for (const mixin of directives.mixins) {
      const existing = this.mixinIndex.get(mixin.name) ?? [];
      existing.push(mixin);
      this.mixinIndex.set(mixin.name, existing);
    }

    for (const ext of directives.extends) {
      const existing = this.extendIndex.get(ext.targetClassName) ?? [];
      existing.push(ext);
      this.extendIndex.set(ext.targetClassName, existing);
    }

    for (const inc of directives.includes) {
      const existing = this.includeIndex.get(inc.mixinName) ?? [];
      existing.push(inc);
      this.includeIndex.set(inc.mixinName, existing);
    }
  }

  /**
   * Remove SCSS directives for a file from all directive indexes.
   */
  private removeDirectives(filePath: string): void {
    const directives = this.fileDirectives.get(filePath);
    if (!directives) return;

    for (const mixin of directives.mixins) {
      const existing = this.mixinIndex.get(mixin.name);
      if (existing) {
        const filtered = existing.filter((m) => m.filePath !== filePath);
        if (filtered.length > 0) {
          this.mixinIndex.set(mixin.name, filtered);
        } else {
          this.mixinIndex.delete(mixin.name);
        }
      }
    }

    for (const ext of directives.extends) {
      const existing = this.extendIndex.get(ext.targetClassName);
      if (existing) {
        const filtered = existing.filter((e) => e.filePath !== filePath);
        if (filtered.length > 0) {
          this.extendIndex.set(ext.targetClassName, filtered);
        } else {
          this.extendIndex.delete(ext.targetClassName);
        }
      }
    }

    for (const inc of directives.includes) {
      const existing = this.includeIndex.get(inc.mixinName);
      if (existing) {
        const filtered = existing.filter((i) => i.filePath !== filePath);
        if (filtered.length > 0) {
          this.includeIndex.set(inc.mixinName, filtered);
        } else {
          this.includeIndex.delete(inc.mixinName);
        }
      }
    }

    this.fileDirectives.delete(filePath);
  }
}
