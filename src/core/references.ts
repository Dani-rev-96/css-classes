import type { CssClassesConfig, CssClassReference } from "../types.js";
import { parseHtmlClasses } from "../parsers/html-parser.js";
import { parseVueClasses } from "../parsers/vue-parser.js";
import { parseReactClasses } from "../parsers/react-parser.js";
import { getFileLanguage, scanTemplateFiles, readFileContent } from "../scanner/workspace-scanner.js";
import type { CssClassIndex } from "./css-index.js";

export interface ReferenceResult {
  className: string;
  references: Array<{
    filePath: string;
    line: number;
    column: number;
    endColumn: number;
  }>;
}

/**
 * Find all references (usages) of a CSS class name across template files.
 *
 * Searches through all HTML, Vue, and React files in the workspace,
 * parsing each to find where the given class name is used.
 */
export async function getReferences(
  className: string,
  workspaceRoot: string,
  config: CssClassesConfig,
  openDocuments?: Map<string, string>,
  index?: CssClassIndex,
): Promise<ReferenceResult> {
  const result: ReferenceResult = {
    className,
    references: [],
  };

  const files = await scanTemplateFiles(workspaceRoot, config);

  const allRefs = await Promise.all(
    files.map(async (filePath) => {
      // Prefer open document content over reading from disk
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
        result.references.push({
          filePath: ref.filePath,
          line: ref.line,
          column: ref.column,
          endColumn: ref.endColumn,
        });
      }
    }
  }

  // Also include the CSS definitions themselves as references
  if (index) {
    const defs = index.lookup(className);
    for (const def of defs) {
      result.references.push({
        filePath: def.filePath,
        line: def.line,
        column: def.column,
        endColumn: def.endColumn,
      });
    }
  }

  return result;
}

/**
 * Find all class references across all template files in the workspace.
 * Used by the diagnostics provider to collect all class usages.
 */
export async function getAllReferences(
  workspaceRoot: string,
  config: CssClassesConfig,
  openDocuments?: Map<string, string>,
): Promise<CssClassReference[]> {
  const files = await scanTemplateFiles(workspaceRoot, config);
  const allRefs: CssClassReference[] = [];

  const results = await Promise.all(
    files.map(async (filePath) => {
      const content = openDocuments?.get(filePath) ?? (await readFileContent(filePath));
      if (!content) return [];

      const lang = getFileLanguage(filePath, config);
      if (!lang || lang === "css") return [];

      return parseFileForReferences(content, filePath, lang);
    }),
  );

  for (const fileRefs of results) {
    allRefs.push(...fileRefs);
  }

  return allRefs;
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
