import type { CssClassesConfig, CssClassReference, CssClassDefinition } from "../types.js";
import { parseHtmlClasses } from "../parsers/html-parser.js";
import { parseVueClasses } from "../parsers/vue-parser.js";
import { parseReactClasses } from "../parsers/react-parser.js";
import { tsParseHtmlClasses, tsParseReactClasses, tsParseVueClasses } from "../parsers/treesitter/index.js";
import { getFileLanguage, scanTemplateFiles, readFileContent } from "../scanner/workspace-scanner.js";
import { getWordAtOffset, positionToOffset } from "../utils/position.js";
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
   *
   * When undefined, the edit range covers the literal class name and the
   * new text is simply the new name.
   */
  parentPrefix?: string;
}

export interface PrepareRenameResult {
  /** The full class name at the cursor (no BEM resolution) */
  className: string;
  /** Zero-based line */
  line: number;
  /** Zero-based column start of the class name */
  column: number;
  /** Zero-based column end of the class name */
  endColumn: number;
}

export interface RenameResult {
  /** The original class name */
  oldName: string;
  /** All locations to rename (both definitions and references) */
  edits: RenameEdit[];
}

// ─── Prepare Rename ──────────────────────────────────────────────────────────

/**
 * Determine the exact class name and range at the cursor for rename.
 * Unlike getDefinition(), this does NOT apply BEM part resolution —
 * it always returns the full class name under the cursor.
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
    return prepareRenameInCss(content, filePath, line, column, index);
  }

  // Template file: parse all class references and find the one at cursor
  const refs = await parseRefsForFile(content, filePath, lang, config);
  const ref = findRefAtPosition(refs, line, column);

  if (ref) {
    return {
      className: ref.className,
      line: ref.line,
      column: ref.column,
      endColumn: ref.endColumn,
    };
  }

  // Fallback: try word-at-cursor that exists in the index
  return prepareRenameByWord(content, line, column, index);
}

/**
 * Prepare rename for a CSS/SCSS file.
 * Finds the class name under cursor in the selector context.
 */
function prepareRenameInCss(
  content: string,
  _filePath: string,
  line: number,
  column: number,
  index: CssClassIndex,
): PrepareRenameResult | null {
  const offset = positionToOffset(content, line, column);
  const word = getWordAtOffset(content, offset);
  if (!word) return null;

  // Check if there's a '.' immediately before the word → class selector
  const dotBefore = word.start > 0 && content[word.start - 1] === ".";

  // The word must be a known class (or at least look like one)
  const defs = index.lookup(word.word);
  if (defs.length === 0 && !dotBefore) return null;

  // Compute line/column of word start
  const lines = content.split("\n");
  let charCount = 0;
  let wordLine = 0;
  let wordCol = 0;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= word.start) {
      wordLine = i;
      wordCol = word.start - charCount;
      break;
    }
    charCount += lines[i].length + 1; // +1 for \n
  }

  return {
    className: word.word,
    line: wordLine,
    column: wordCol,
    endColumn: wordCol + word.word.length,
  };
}

/**
 * Fallback: get the word at cursor and check if it's a known class.
 */
function prepareRenameByWord(
  content: string,
  line: number,
  column: number,
  index: CssClassIndex,
): PrepareRenameResult | null {
  const offset = positionToOffset(content, line, column);
  const word = getWordAtOffset(content, offset);
  if (!word) return null;

  const defs = index.lookup(word.word);
  if (defs.length === 0) return null;

  // Compute line/column from the word offset
  const lines = content.split("\n");
  let charCount = 0;
  let wordLine = 0;
  let wordCol = 0;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= word.start) {
      wordLine = i;
      wordCol = word.start - charCount;
      break;
    }
    charCount += lines[i].length + 1;
  }

  return {
    className: word.word,
    line: wordLine,
    column: wordCol,
    endColumn: wordCol + word.word.length,
  };
}

// ─── Rename Edits ────────────────────────────────────────────────────────────

/**
 * Compute all rename edits for a CSS class name.
 *
 * Collects:
 *  1. All CSS/SCSS definitions of the class (from the index)
 *  2. All template references (HTML class="", Vue :class, React className)
 *
 * Handles SCSS nested definitions by computing the correct edit range
 * and attaching `parentPrefix` so the server can produce the right new text.
 *
 * When `config.renameScope` is "file", only edits in `currentFilePath` are returned.
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

  // 1. Collect all CSS definitions from the index
  const defs = index.lookup(className);
  for (const def of defs) {
    if (fileScope && def.filePath !== fileScope) continue;
    const edit = definitionToEdit(def);
    if (edit) edits.push(edit);
  }

  // 2. Collect all template references
  if (fileScope) {
    // Only parse the current file
    const content = openDocuments?.get(fileScope);
    if (content) {
      const lang = getFileLanguage(fileScope, config);
      if (lang && lang !== "css") {
        const refs = await parseRefsForFile(content, fileScope, lang, config);
        for (const ref of refs) {
          if (ref.className === className) {
            edits.push({
              filePath: ref.filePath,
              line: ref.line,
              column: ref.column,
              endColumn: ref.endColumn,
            });
          }
        }
      }
    }
  } else {
    // Workspace-wide: scan all template files
    const files = await scanTemplateFiles(workspaceRoot, config);
    const allRefs = await Promise.all(
      files.map(async (filePath) => {
        const content = openDocuments?.get(filePath) ?? (await readFileContent(filePath));
        if (!content) return [];

        const lang = getFileLanguage(filePath, config);
        if (!lang || lang === "css") return [];

        return parseRefsForFile(content, filePath, lang, config);
      }),
    );

    for (const fileRefs of allRefs) {
      for (const ref of fileRefs) {
        if (ref.className === className) {
          edits.push({
            filePath: ref.filePath,
            line: ref.line,
            column: ref.column,
            endColumn: ref.endColumn,
          });
        }
      }
    }
  }

  return { oldName: className, edits };
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
 * Compute the new text for a rename edit, given the user's new class name.
 *
 * For plain edits (no `parentPrefix`): returns `newName` as-is.
 * For SCSS nested edits: returns `"&" + newName.slice(parentPrefix.length)`.
 * If the new name doesn't share the same parent prefix, returns the full new name
 * (which will break the SCSS nesting, but is the user's explicit intent).
 */
export function computeNewText(edit: RenameEdit, newName: string): string {
  if (!edit.parentPrefix) {
    return newName;
  }

  if (newName.startsWith(edit.parentPrefix)) {
    return "&" + newName.slice(edit.parentPrefix.length);
  }

  // The user changed the prefix part too — we can't keep the `&` nesting.
  // Return the full new name (will break the SCSS nesting structure, but
  // at least produces a valid CSS class; user can restructure manually).
  return newName;
}
