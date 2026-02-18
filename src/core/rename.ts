import type { CssClassesConfig, CssClassReference, CssClassDefinition } from "../types.js";
import { parseHtmlClasses } from "../parsers/html-parser.js";
import { parseVueClasses } from "../parsers/vue-parser.js";
import { parseReactClasses } from "../parsers/react-parser.js";
import { getFileLanguage, scanTemplateFiles, readFileContent } from "../scanner/workspace-scanner.js";
import type { CssClassIndex } from "./css-index.js";

export interface RenameEdit {
  filePath: string;
  line: number;
  column: number;
  endColumn: number;
}

export interface RenameResult {
  /** The original class name */
  oldName: string;
  /** All locations to rename (both definitions and references) */
  edits: RenameEdit[];
}

/**
 * Compute all rename edits for a CSS class name.
 *
 * Collects:
 *  1. All CSS/SCSS definitions of the class (from the index)
 *  2. All template references (HTML class="", Vue :class, React className)
 *
 * Returns the list of text edits to apply.
 */
export async function getRename(
  className: string,
  workspaceRoot: string,
  config: CssClassesConfig,
  index: CssClassIndex,
  openDocuments?: Map<string, string>,
): Promise<RenameResult> {
  const edits: RenameEdit[] = [];

  // 1. Collect all CSS definitions from the index
  const defs = index.lookup(className);
  for (const def of defs) {
    edits.push(definitionToEdit(def));
  }

  // 2. Collect all template references
  const files = await scanTemplateFiles(workspaceRoot, config);

  const allRefs = await Promise.all(
    files.map(async (filePath) => {
      const content = openDocuments?.get(filePath) ?? (await readFileContent(filePath));
      if (!content) return [];

      const lang = getFileLanguage(filePath, config);
      if (!lang || lang === "css") return [];

      return parseFileForReferences(content, filePath, lang);
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

  return { oldName: className, edits };
}

/**
 * Convert a CSS class definition to a rename edit location.
 * The edit spans only the class name within the selector, not the entire selector.
 */
function definitionToEdit(def: CssClassDefinition): RenameEdit {
  // The definition tracks the full selector position.
  // For rename, we need the class name position.
  // The rawSelector contains the selector text; find the class name within it.
  // Use the column position and class name length for the edit range.
  // Since the definition line/column points to the selector start,
  // we need to find the class name offset within the raw selector.
  const classOffset = findClassInSelector(def.rawSelector, def.className);

  return {
    filePath: def.filePath,
    line: def.line,
    column: def.column + classOffset + 1, // +1 to skip the '.' prefix
    endColumn: def.column + classOffset + 1 + def.className.length,
  };
}

/**
 * Find the offset of .className in a raw CSS selector string.
 * Returns the offset of the '.' before the class name.
 */
function findClassInSelector(rawSelector: string, className: string): number {
  const pattern = new RegExp(`\\.${escapeRegExp(className)}(?![\\w-])`);
  const match = rawSelector.match(pattern);
  return match?.index ?? 0;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a template file for class references based on its language type.
 */
function parseFileForReferences(
  content: string,
  filePath: string,
  lang: "html" | "vue" | "react",
): CssClassReference[] {
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
