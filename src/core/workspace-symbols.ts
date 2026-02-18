import type { CssClassIndex } from "./css-index.js";

export interface WorkspaceSymbol {
  /** The class name */
  name: string;
  /** Symbol kind — always "class" for CSS classes */
  kind: "class";
  /** The file where this class is defined */
  filePath: string;
  /** Zero-based line */
  line: number;
  /** Zero-based column */
  column: number;
  /** The raw selector */
  containerName: string;
}

/**
 * Search for CSS class definitions matching a query string.
 * Used by the workspace/symbol LSP request.
 */
export function getWorkspaceSymbols(
  query: string,
  index: CssClassIndex,
  limit = 200,
): WorkspaceSymbol[] {
  const symbols: WorkspaceSymbol[] = [];
  const lowerQuery = query.toLowerCase();
  const allNames = index.allClassNames();

  // First pass: prefix matches
  for (const name of allNames) {
    if (symbols.length >= limit) break;

    if (name.toLowerCase().startsWith(lowerQuery)) {
      const defs = index.lookup(name);
      for (const def of defs) {
        if (symbols.length >= limit) break;
        symbols.push({
          name,
          kind: "class",
          filePath: def.filePath,
          line: def.line,
          column: def.column,
          containerName: def.rawSelector,
        });
      }
    }
  }

  // Second pass: contains matches (if room)
  if (symbols.length < limit) {
    for (const name of allNames) {
      if (symbols.length >= limit) break;
      if (name.toLowerCase().startsWith(lowerQuery)) continue; // already added

      if (name.toLowerCase().includes(lowerQuery)) {
        const defs = index.lookup(name);
        for (const def of defs) {
          if (symbols.length >= limit) break;
          symbols.push({
            name,
            kind: "class",
            filePath: def.filePath,
            line: def.line,
            column: def.column,
            containerName: def.rawSelector,
          });
        }
      }
    }
  }

  // Third pass: fuzzy matches (if room)
  if (symbols.length < limit && query.length >= 2) {
    for (const name of allNames) {
      if (symbols.length >= limit) break;
      if (name.toLowerCase().includes(lowerQuery)) continue; // already added

      if (fuzzyMatch(lowerQuery, name.toLowerCase())) {
        const defs = index.lookup(name);
        for (const def of defs) {
          if (symbols.length >= limit) break;
          symbols.push({
            name,
            kind: "class",
            filePath: def.filePath,
            line: def.line,
            column: def.column,
            containerName: def.rawSelector,
          });
        }
      }
    }
  }

  return symbols;
}

/**
 * Simple fuzzy matching: all characters of the query appear in order in the target.
 */
function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}
