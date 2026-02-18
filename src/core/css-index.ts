import type { CssClassDefinition, CssClassesConfig } from "../types.js";
import { parseCssClasses, extractStyleBlocks } from "../parsers/css-parser.js";
import { scanWorkspace, readFileContent } from "../scanner/workspace-scanner.js";
import { resolveFileImports } from "./import-resolver.js";

/**
 * In-memory index of all CSS class definitions across the workspace.
 * Provides O(1) lookup by class name.
 */
export class CssClassIndex {
  /** Map from class name -> list of definitions */
  private index = new Map<string, CssClassDefinition[]>();

  /** Map from file path -> list of class names defined in that file */
  private fileIndex = new Map<string, Set<string>>();

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
   * Fully re-index the workspace by scanning all CSS/SCSS files.
   * Follows @import/@use/@forward chains to include referenced files.
   */
  async indexWorkspace(workspaceRoot: string): Promise<void> {
    const files = await scanWorkspace(workspaceRoot, this.config);

    this.index.clear();
    this.fileIndex.clear();

    // Index all directly-found files
    const results = await Promise.all(
      files.map(async (filePath) => {
        const content = await readFileContent(filePath);
        if (!content) return { classes: [] as CssClassDefinition[], content: null, filePath };
        const classes = parseCssClasses(content, filePath, this.config);
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

        const classes = parseCssClasses(content, newFile, this.config);
        for (const def of classes) {
          this.addDefinition(def);
        }
        importQueue.push({ filePath: newFile, content });
      }
    }
  }

  /**
   * Index a single file (e.g. on file change/create).
   */
  async indexFile(filePath: string, content?: string): Promise<void> {
    // Remove old entries for this file
    this.removeFile(filePath);

    const fileContent = content ?? (await readFileContent(filePath));
    if (!fileContent) return;

    const classes = parseCssClasses(fileContent, filePath, this.config);
    for (const def of classes) {
      this.addDefinition(def);
    }
  }

  /**
   * Index embedded <style> blocks from Vue/Svelte/HTML files.
   */
  indexEmbeddedStyles(filePath: string, content: string): void {
    const blocks = extractStyleBlocks(content);
    for (const block of blocks) {
      const classes = parseCssClasses(block.content, filePath, this.config);
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
    if (!classNames) return;

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
}
