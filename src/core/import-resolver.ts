import * as path from "node:path";
import { readFileContent } from "../scanner/workspace-scanner.js";

/**
 * Represents a resolved CSS/SCSS import.
 */
export interface ResolvedImport {
  /** The original import specifier */
  specifier: string;
  /** The resolved absolute file path (or null if unresolvable) */
  resolvedPath: string | null;
  /** Zero-based line of the @import/@use statement */
  line: number;
  /** The type of import */
  type: "import" | "use" | "forward";
}

/**
 * Extract @import, @use, and @forward statements from CSS/SCSS content.
 */
export function extractImports(content: string): Array<{ specifier: string; line: number; type: "import" | "use" | "forward" }> {
  const imports: Array<{ specifier: string; line: number; type: "import" | "use" | "forward" }> = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // @import "path" or @import 'path'
    const importMatch = line.match(/^@import\s+(['"])([^'"]+)\1/);
    if (importMatch) {
      imports.push({ specifier: importMatch[2], line: i, type: "import" });
      continue;
    }

    // @import url("path") or @import url('path')
    const importUrlMatch = line.match(/^@import\s+url\(\s*(['"]?)([^'")\s]+)\1\s*\)/);
    if (importUrlMatch) {
      imports.push({ specifier: importUrlMatch[2], line: i, type: "import" });
      continue;
    }

    // @use "path" (SCSS)
    const useMatch = line.match(/^@use\s+(['"])([^'"]+)\1/);
    if (useMatch) {
      imports.push({ specifier: useMatch[2], line: i, type: "use" });
      continue;
    }

    // @forward "path" (SCSS)
    const forwardMatch = line.match(/^@forward\s+(['"])([^'"]+)\1/);
    if (forwardMatch) {
      imports.push({ specifier: forwardMatch[2], line: i, type: "forward" });
      continue;
    }
  }

  return imports;
}

/**
 * Resolve an import specifier to an absolute file path.
 *
 * Resolution order for SCSS:
 *  1. Exact path (with extension)
 *  2. Add .scss extension
 *  3. Add .css extension
 *  4. Partial: prepend _ to filename (_partial.scss)
 *  5. Directory with _index.scss or index.scss
 */
export async function resolveImportPath(
  specifier: string,
  fromFile: string,
): Promise<string | null> {
  // Skip URLs and bare module specifiers
  if (specifier.startsWith("http://") || specifier.startsWith("https://") || specifier.startsWith("//")) {
    return null;
  }

  const dir = path.dirname(fromFile);
  const candidates = buildResolutionCandidates(specifier, dir);

  for (const candidate of candidates) {
    const content = await readFileContent(candidate);
    if (content !== null) {
      return candidate;
    }
  }

  return null;
}

/**
 * Build a list of candidate file paths to try for import resolution.
 */
function buildResolutionCandidates(specifier: string, fromDir: string): string[] {
  const candidates: string[] = [];
  const ext = path.extname(specifier);
  const resolved = path.resolve(fromDir, specifier);

  // 1. Exact path if it has an extension
  if (ext) {
    candidates.push(resolved);
  }

  // 2. Add extensions
  if (!ext) {
    candidates.push(resolved + ".scss");
    candidates.push(resolved + ".css");
  }

  // 3. Partial: prepend _ to filename
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  const partialBase = "_" + (ext ? base : base + ".scss");
  candidates.push(path.join(dir, partialBase));

  if (!ext) {
    candidates.push(path.join(dir, "_" + base + ".css"));
  }

  // 4. Directory index
  if (!ext) {
    candidates.push(path.join(resolved, "_index.scss"));
    candidates.push(path.join(resolved, "index.scss"));
    candidates.push(path.join(resolved, "_index.css"));
    candidates.push(path.join(resolved, "index.css"));
  }

  return candidates;
}

/**
 * Resolve all imports in a CSS/SCSS file and return the resolved paths.
 */
export async function resolveFileImports(
  content: string,
  filePath: string,
): Promise<ResolvedImport[]> {
  const rawImports = extractImports(content);
  const resolved: ResolvedImport[] = [];

  for (const imp of rawImports) {
    const resolvedPath = await resolveImportPath(imp.specifier, filePath);
    resolved.push({
      specifier: imp.specifier,
      resolvedPath,
      line: imp.line,
      type: imp.type,
    });
  }

  return resolved;
}
