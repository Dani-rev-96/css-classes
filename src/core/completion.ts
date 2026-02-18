import type { CssClassIndex } from "./css-index.js";

export interface CompletionItem {
  label: string;
  detail: string;
  documentation?: string;
}

/**
 * Provide CSS class name completions based on the index.
 */
export function getCompletions(
  prefix: string,
  index: CssClassIndex,
  limit = 100,
): CompletionItem[] {
  const allNames = index.allClassNames();
  const lowerPrefix = prefix.toLowerCase();

  const matches: CompletionItem[] = [];

  for (const name of allNames) {
    if (matches.length >= limit) break;

    if (name.toLowerCase().startsWith(lowerPrefix)) {
      const defs = index.lookup(name);
      const fileCount = new Set(defs.map((d) => d.filePath)).size;

      matches.push({
        label: name,
        detail: `${defs.length} definition${defs.length > 1 ? "s" : ""} in ${fileCount} file${fileCount > 1 ? "s" : ""}`,
        documentation: defs
          .slice(0, 3)
          .map((d) => {
            const shortPath = d.filePath.split("/").slice(-2).join("/");
            return `${shortPath}:${d.line + 1}`;
          })
          .join("\n"),
      });
    }
  }

  // If we have fewer than limit results, also do fuzzy matching
  if (matches.length < limit && prefix.length >= 2) {
    for (const name of allNames) {
      if (matches.length >= limit) break;
      if (name.toLowerCase().startsWith(lowerPrefix)) continue; // already added

      if (fuzzyMatch(lowerPrefix, name.toLowerCase())) {
        const defs = index.lookup(name);
        const fileCount = new Set(defs.map((d) => d.filePath)).size;

        matches.push({
          label: name,
          detail: `${defs.length} def${defs.length > 1 ? "s" : ""} in ${fileCount} file${fileCount > 1 ? "s" : ""} (fuzzy)`,
        });
      }
    }
  }

  return matches;
}

/**
 * Simple fuzzy matching: all characters of the prefix appear in order in the target.
 */
function fuzzyMatch(prefix: string, target: string): boolean {
  let pi = 0;
  for (let ti = 0; ti < target.length && pi < prefix.length; ti++) {
    if (target[ti] === prefix[pi]) pi++;
  }
  return pi === prefix.length;
}
