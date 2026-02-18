import type { CssClassesConfig, CssClassReference } from "../types.js";
import type { CssClassIndex } from "./css-index.js";

export interface Diagnostic {
  /** The class name that triggered the diagnostic */
  className: string;
  /** Absolute file path */
  filePath: string;
  /** Zero-based line */
  line: number;
  /** Zero-based start column */
  column: number;
  /** Zero-based end column */
  endColumn: number;
  /** Severity: "warning" or "error" */
  severity: "warning" | "error" | "info";
  /** Human-readable message */
  message: string;
  /** Diagnostic code for programmatic handling */
  code: string;
}

/**
 * Analyze a file's class references and produce diagnostics.
 *
 * Current diagnostics:
 *  - css-classes/undefined: Class name not found in any indexed stylesheet
 *  - css-classes/duplicate-definition: Class defined in multiple files (info)
 */
export function getDiagnostics(
  refs: CssClassReference[],
  index: CssClassIndex,
  _config: CssClassesConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const ref of refs) {
    const defs = index.lookup(ref.className);

    if (defs.length === 0) {
      diagnostics.push({
        className: ref.className,
        filePath: ref.filePath,
        line: ref.line,
        column: ref.column,
        endColumn: ref.endColumn,
        severity: "warning",
        message: `CSS class '${ref.className}' is not defined in any indexed stylesheet`,
        code: "css-classes/undefined",
      });
    }
  }

  return diagnostics;
}

/**
 * Get diagnostics for duplicate class definitions (same class name in multiple files).
 * Returns one diagnostic per file where the class is defined.
 */
export function getDefinitionDiagnostics(
  index: CssClassIndex,
  _config: CssClassesConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const allNames = index.allClassNames();

  for (const className of allNames) {
    const defs = index.lookup(className);
    const files = new Set(defs.map((d) => d.filePath));

    if (files.size > 1) {
      for (const def of defs) {
        diagnostics.push({
          className,
          filePath: def.filePath,
          line: def.line,
          column: def.column,
          endColumn: def.endColumn,
          severity: "info",
          message: `CSS class '${className}' is also defined in ${files.size - 1} other file(s)`,
          code: "css-classes/duplicate-definition",
        });
      }
    }
  }

  return diagnostics;
}
