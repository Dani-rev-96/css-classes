import type { CssClassesConfig, CssClassReference, CssClassDefinition } from "../types.js";
import { parseHtmlClasses } from "../parsers/html-parser.js";
import { parseVueClasses } from "../parsers/vue-parser.js";
import { parseReactClasses } from "../parsers/react-parser.js";
import { tsParseHtmlClasses, tsParseReactClasses, tsParseVueClasses } from "../parsers/treesitter/index.js";
import { getFileLanguage, scanTemplateFiles, readFileContent } from "../scanner/workspace-scanner.js";
import { getWordAtOffset, positionToOffset } from "../utils/position.js";
import { parseBem, bemTargetAtOffset } from "../utils/bem.js";
import type { CssClassIndex } from "./css-index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RenameEdit {
  filePath: string;
  line: number;
  /** Zero-based column start of the text to replace */
  column: number;
  /** Zero-based column end of the text to replace */
  endColumn: number;
  /**
   * For SCSS nested definitions where `&` resolves to a parent prefix:
   * the parent prefix string that `&` represents.
   * When set, the edit range covers the `&`-suffixed selector portion
   * and the server must compute the new text as:
   *   `"&" + newName.slice(parentPrefix.length)`
   */
  parentPrefix?: string;
  /**
   * The original full class name that this edit belongs to.
   * Used for BEM cascade: when renaming a block, each child class
   * has a different `originalClassName` with the same prefix being replaced.
   */
  originalClassName?: string;
}

export interface PrepareRenameResult {
  /**
   * The BEM-resolved target class name at the cursor.
   * When cursor is on "overlay" in `overlay__spacer`, this is `overlay` (the block).
   * When cursor is on "spacer" in `overlay__spacer`, this is `overlay__spacer`.
   */
  className: string;
  /** Zero-based line */
  line: number;
  /** Zero-based column start of the rename target within the full class */
  column: number;
  /** Zero-based column end of the rename target */
  endColumn: number;
}

export interface RenameResult {
  /** The original class name (BEM-resolved target) */
  oldName: string;
  /** All locations to rename (definitions + references, including BEM cascade) */
  edits: RenameEdit[];
}

// ─── Prepare Rename ──────────────────────────────────────────────────────────

/**
 * Determine the exact class name and range at the cursor for rename.
 *
 * BEM-aware: if cursor is on the "block" portion of `block__element`, the
 * target is just the block name and the range covers only that substring.
 * This way the user renames the block prefix, and getRename cascades to all
 * BEM children.
 *
 * Works for both template files (HTML/Vue/React) and CSS/SCSS files.
 */
export async function prepareRename(
  content: string,
  filePath: string,
  line: number,
  column: number,
  config: CssClassesConfig,
  index: CssClassIndex,
): Promise<PrepareRenameResult | null> {
  const lang = getFileLanguage(filePath, config);
  if (!lang) return null;

  if (lang === "css") {
    return prepareRenameInCss(content, line, column, index, config);
  }

  // Template file: parse all class references and find the one at cursor
  const refs = await parseRefsForFile(content, filePath, lang, config);
  const ref = findRefAtPosition(refs, line, column);

  if (ref) {
    return bemAwarePrepare(ref.className, ref.line, ref.column, ref.endColumn, column, config);
  }

  // Fallback: try word-at-cursor that exists in the index
  return prepareRenameByWord(content, line, column, index, config);
}

/**
 * Given a full class name and its range, resolve BEM part at cursor.
 * Returns the BEM target substring and adjusts the range accordingly.
 */
function bemAwarePrepare(
  fullClassName: string,
  refLine: number,
  refColumn: number,
  refEndColumn: number,
  cursorColumn: number,
  config: CssClassesConfig,
): PrepareRenameResult {
  if (!config.bemEnabled) {
    return { className: fullClassName, line: refLine, column: refColumn, endColumn: refEndColumn };
  }

  const offsetInClass = cursorColumn - refColumn;
  const target = bemTargetAtOffset(
    fullClassName,
    offsetInClass,
    config.bemSeparators.element,
    config.bemSeparators.modifier,
  );

  // target is either the full class or a BEM prefix (block or block__element)
  return {
    className: target,
    line: refLine,
    column: refColumn,
    endColumn: refColumn + target.length,
  };
}

/**
 * Prepare rename for a CSS/SCSS file.
 */
function prepareRenameInCss(
  content: string,
  line: number,
  column: number,
  index: CssClassIndex,
  config: CssClassesConfig,
): PrepareRenameResult | null {
  const offset = positionToOffset(content, line, column);
  const word = getWordAtOffset(content, offset);
  if (!word) return null;

  const dotBefore = word.start > 0 && content[word.start - 1] === ".";
  const defs = index.lookup(word.word);
  if (defs.length === 0 && !dotBefore) return null;

  const wordPos = offsetToLineCol(content, word.start);

  return bemAwarePrepare(
    word.word,
    wordPos.line,
    wordPos.col,
    wordPos.col + word.word.length,
    column,
    config,
  );
}

/**
 * Fallback: get the word at cursor and check if it's a known class.
 */
function prepareRenameByWord(
  content: string,
  line: number,
  column: number,
  index: CssClassIndex,
  config: CssClassesConfig,
): PrepareRenameResult | null {
  const offset = positionToOffset(content, line, column);
  const word = getWordAtOffset(content, offset);
  if (!word) return null;

  const defs = index.lookup(word.word);
  if (defs.length === 0) return null;

  const wordPos = offsetToLineCol(content, word.start);

  return bemAwarePrepare(
    word.word,
    wordPos.line,
    wordPos.col,
    wordPos.col + word.word.length,
    column,
    config,
  );
}

// ─── Rename Edits ────────────────────────────────────────────────────────────

/**
 * Compute all rename edits for a CSS class name, with BEM cascade.
 *
 * When renaming a BEM block (e.g. "overlay"), all classes that start with
 * that block prefix are included:
 *   overlay, overlay__spacer, overlay--active, overlay__spacer--big
 *
 * When renaming an element (e.g. "overlay__spacer"), modifiers of that
 * element are included:
 *   overlay__spacer, overlay__spacer--big
 *
 * For each affected class, we collect:
 *   1. CSS/SCSS definitions (from the index)
 *   2. Template references (HTML/Vue/React)
 *
 * Each edit carries `originalClassName` so the server can compute the
 * correct replacement text by substituting the old prefix with the new one.
 */
export async function getRename(
  className: string,
  workspaceRoot: string,
  config: CssClassesConfig,
  index: CssClassIndex,
  currentFilePath?: string,
  openDocuments?: Map<string, string>,
): Promise<RenameResult> {
  const edits: RenameEdit[] = [];
  const fileScope = config.renameScope === "file" ? currentFilePath : undefined;

  // Determine all affected class names (BEM cascade)
  const affectedClasses = collectBemCascade(className, index, config);

  // 1. Collect CSS definitions for all affected classes
  for (const cls of affectedClasses) {
    const defs = index.lookup(cls);
    for (const def of defs) {
      if (fileScope && def.filePath !== fileScope) continue;
      const edit = definitionToEdit(def);
      if (edit) {
        edit.originalClassName = cls;
        edits.push(edit);
      }
    }
  }

  // 2. Collect template references for all affected classes
  const affectedSet = new Set(affectedClasses);
  const templateRefs = await collectTemplateRefs(workspaceRoot, config, fileScope, openDocuments);

  for (const ref of templateRefs) {
    if (affectedSet.has(ref.className)) {
      edits.push({
        filePath: ref.filePath,
        line: ref.line,
        column: ref.column,
        endColumn: ref.endColumn,
        originalClassName: ref.className,
      });
    }
  }

  return { oldName: className, edits };
}

/**
 * Collect all class names affected by renaming `className` (BEM cascade).
 *
 * If `className` is a BEM block → include block + all block__* and block--*
 * If `className` is a BEM element → include element + all element--*
 * If `className` is a full BEM (block__elem--mod) → just that class
 * If BEM is disabled → just that class
 */
function collectBemCascade(
  className: string,
  index: CssClassIndex,
  config: CssClassesConfig,
): string[] {
  if (!config.bemEnabled) return [className];

  const elemSep = config.bemSeparators.element;
  const modSep = config.bemSeparators.modifier;
  const parts = parseBem(className, elemSep, modSep);

  if (!parts) return [className];

  const allClasses = index.allClassNames();
  const result: string[] = [className];

  if (!parts.element && !parts.modifier) {
    // className is a plain block → cascade to all block__* and block--*
    const blockPrefix = className + elemSep;
    const blockModPrefix = className + modSep;
    for (const cls of allClasses) {
      if (cls === className) continue;
      if (cls.startsWith(blockPrefix) || cls.startsWith(blockModPrefix)) {
        result.push(cls);
      }
    }
  } else if (parts.element && !parts.modifier) {
    // className is block__element → cascade to all block__element--*
    const elemModPrefix = className + modSep;
    for (const cls of allClasses) {
      if (cls === className) continue;
      if (cls.startsWith(elemModPrefix)) {
        result.push(cls);
      }
    }
  }
  // If it already has a modifier, no further cascade needed

  return result;
}

/**
 * Collect all template references across the workspace (or scoped to a file).
 */
async function collectTemplateRefs(
  workspaceRoot: string,
  config: CssClassesConfig,
  fileScope?: string,
  openDocuments?: Map<string, string>,
): Promise<CssClassReference[]> {
  const allRefs: CssClassReference[] = [];

  if (fileScope) {
    const content = openDocuments?.get(fileScope);
    if (content) {
      const lang = getFileLanguage(fileScope, config);
      if (lang && lang !== "css") {
        const refs = await parseRefsForFile(content, fileScope, lang, config);
        allRefs.push(...refs);
      }
    }
    return allRefs;
  }

  // Workspace-wide
  const files = await scanTemplateFiles(workspaceRoot, config);
  const results = await Promise.all(
    files.map(async (filePath) => {
      const content = openDocuments?.get(filePath) ?? (await readFileContent(filePath));
      if (!content) return [];
      const lang = getFileLanguage(filePath, config);
      if (!lang || lang === "css") return [];
      return parseRefsForFile(content, filePath, lang, config);
    }),
  );

  for (const fileRefs of results) {
    allRefs.push(...fileRefs);
  }
  return allRefs;
}

// ─── Definition → Edit Conversion ────────────────────────────────────────────

/**
 * Convert a CSS class definition to a rename edit.
 *
 * For flat definitions (`.my-class { }`):
 *   Edit range = the class name after the `.`
 *
 * For SCSS nested definitions (`&__element`, `&--modifier`, `&-sub`):
 *   Edit range = the `&`-prefixed suffix in source (e.g., `&__element`)
 *   `parentPrefix` = the resolved parent part (e.g., `block` if full name is `block__element`)
 *   The server uses `parentPrefix` to compute the new text:
 *     `"&" + newName.slice(parentPrefix.length)`
 */
function definitionToEdit(def: CssClassDefinition): RenameEdit | null {
  const raw = def.rawSelector;

  // Case 1: SCSS nested definition — rawSelector starts with `&`
  if (def.nested && raw.startsWith("&")) {
    return nestedDefinitionToEdit(def);
  }

  // Case 2: flat definition — find `.className` in the rawSelector
  return flatDefinitionToEdit(def);
}

/**
 * Handle a flat (non-nested) CSS definition.
 * Finds `.className` in the rawSelector and returns the edit for the class name.
 */
function flatDefinitionToEdit(def: CssClassDefinition): RenameEdit | null {
  const raw = def.rawSelector;
  const pattern = new RegExp(`\\.${escapeRegExp(def.className)}(?![\\w-])`);
  const match = raw.match(pattern);

  if (!match || match.index === undefined) {
    // Fallback: class name should be right after the first `.`
    const dotIdx = raw.indexOf(".");
    if (dotIdx >= 0) {
      return {
        filePath: def.filePath,
        line: def.line,
        column: def.column + dotIdx + 1,
        endColumn: def.column + dotIdx + 1 + def.className.length,
      };
    }
    return null;
  }

  return {
    filePath: def.filePath,
    line: def.line,
    column: def.column + match.index + 1, // +1 to skip the `.`
    endColumn: def.column + match.index + 1 + def.className.length,
  };
}

/**
 * Handle an SCSS nested definition where rawSelector starts with `&`.
 *
 * Example: `.block { &__element { } }`
 *   rawSelector = "&__element"
 *   className   = "block__element"
 *   line/column = position of `&` in source
 *
 * The suffix after `&` is `__element`. The parent prefix is `block`.
 * The edit range covers `&__element` in source, and `parentPrefix = "block"`.
 */
function nestedDefinitionToEdit(def: CssClassDefinition): RenameEdit {
  const raw = def.rawSelector;

  // Find the `&`-based class segment in the rawSelector.
  // rawSelector might be complex, e.g., `&__element.other-class` or `&--mod > .child`
  // We need to find the `&`-segment that corresponds to our className.
  const suffix = extractAmpersandSuffix(raw);
  const parentPrefix = def.className.slice(0, def.className.length - suffix.length);

  // The edit range covers the entire `&suffix` part in source
  const ampIdx = raw.indexOf("&");

  return {
    filePath: def.filePath,
    line: def.line,
    column: def.column + ampIdx,
    endColumn: def.column + ampIdx + 1 + suffix.length, // 1 for `&` + suffix
    parentPrefix,
  };
}

/**
 * Extract the suffix that follows `&` at the start of a raw selector.
 * Stops at whitespace, `.`, `,`, `{`, `>`, `+`, `~`, `:`, `[` — anything that
 * indicates the end of the compound class segment.
 *
 * E.g.:
 *   "&__element"         → "__element"
 *   "&--modifier .child" → "--modifier"
 *   "&-sub:hover"        → "-sub"
 *   "&.other"            → ""
 */
function extractAmpersandSuffix(rawSelector: string): string {
  const ampIdx = rawSelector.indexOf("&");
  if (ampIdx === -1) return "";

  let end = ampIdx + 1;
  while (end < rawSelector.length) {
    const ch = rawSelector[end];
    // Stop at boundaries that end the class name segment
    if (/[\s.,>{+~:[\]()]/.test(ch)) break;
    end++;
  }
  return rawSelector.slice(ampIdx + 1, end);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find a class reference that spans the given cursor position.
 */
function findRefAtPosition(
  refs: CssClassReference[],
  line: number,
  column: number,
): CssClassReference | null {
  for (const ref of refs) {
    if (ref.line === line && column >= ref.column && column < ref.endColumn) {
      return ref;
    }
  }
  return null;
}

/**
 * Parse class references from a template file, with tree-sitter fallback.
 */
async function parseRefsForFile(
  content: string,
  filePath: string,
  lang: "html" | "vue" | "react",
  config?: CssClassesConfig,
): Promise<CssClassReference[]> {
  if (config?.experimentalTreeSitter) {
    try {
      switch (lang) {
        case "html":
          return await tsParseHtmlClasses(content, filePath);
        case "vue":
          return await tsParseVueClasses(content, filePath);
        case "react":
          return await tsParseReactClasses(content, filePath);
        default:
          return [];
      }
    } catch {
      // Fall back to regex parsers on tree-sitter failure
    }
  }

  switch (lang) {
    case "html":
      return parseHtmlClasses(content, filePath);
    case "vue":
      return parseVueClasses(content, filePath);
    case "react":
      return parseReactClasses(content, filePath);
    default:
      return [];
  }
}

/**
 * Compute the new text for a rename edit.
 *
 * Handles three cases:
 *  1. SCSS nested edit (`parentPrefix` set): preserves `&` syntax.
 *     The parentPrefix is also affected by the rename (it's the old parent),
 *     so `&` will stand for the NEW parent after the rename.
 *  2. BEM cascade edit (`originalClassName` differs from `oldName`):
 *     replaces the old prefix portion with the new name
 *  3. Plain edit: returns `newName` as-is
 */
export function computeNewText(edit: RenameEdit, oldName: string, newName: string): string {
  const original = edit.originalClassName ?? oldName;

  // First compute what the full new class name should be
  const newFullClass = replacePrefix(original, oldName, newName);

  // Case 1: SCSS nested definition with `&`
  if (edit.parentPrefix) {
    // The parentPrefix is the OLD parent (e.g. "block").
    // After rename, the parent `.block` becomes `.card`, so `&` = "card".
    const newParentPrefix = replacePrefix(edit.parentPrefix, oldName, newName);
    if (newFullClass.startsWith(newParentPrefix)) {
      return "&" + newFullClass.slice(newParentPrefix.length);
    }
    // Can't preserve & nesting after this rename
    return newFullClass;
  }

  // Case 2 & 3: template ref or CSS def — use the computed full new class
  return newFullClass;
}

/**
 * Replace the `oldPrefix` at the start of `fullName` with `newPrefix`.
 * E.g. replacePrefix("block__element", "block", "card") → "card__element"
 * If `fullName` doesn't start with `oldPrefix`, returns `fullName` unchanged.
 */
function replacePrefix(fullName: string, oldPrefix: string, newPrefix: string): string {
  if (fullName === oldPrefix) return newPrefix;
  if (fullName.startsWith(oldPrefix)) {
    return newPrefix + fullName.slice(oldPrefix.length);
  }
  return fullName;
}

/**
 * Convert a character offset to line/col.
 */
function offsetToLineCol(content: string, offset: number): { line: number; col: number } {
  const lines = content.split("\n");
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= offset) {
      return { line: i, col: offset - charCount };
    }
    charCount += lines[i].length + 1;
  }
  return { line: 0, col: 0 };
}
