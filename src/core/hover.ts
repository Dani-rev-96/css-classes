import type { CssClassesConfig } from "../types.js";
import type { CssClassIndex } from "./css-index.js";

export interface HoverResult {
  className: string;
  contents: string;
  definitionCount: number;
}

/**
 * Provide hover information for a CSS class reference.
 */
export function getHover(
  className: string,
  index: CssClassIndex,
  _config: CssClassesConfig,
): HoverResult | null {
  const defs = index.lookup(className);
  if (defs.length === 0) return null;

  const lines: string[] = [];
  lines.push(`**\`.${className}\`** — ${defs.length} definition${defs.length > 1 ? "s" : ""}`);
  lines.push("");

  for (const def of defs.slice(0, 5)) {
    const shortPath = def.filePath.split("/").slice(-2).join("/");
    lines.push(`- \`${shortPath}\` line ${def.line + 1}: \`${def.rawSelector}\``);
    if (def.bem) {
      const parts: string[] = [`block: ${def.bem.block}`];
      if (def.bem.element) parts.push(`element: ${def.bem.element}`);
      if (def.bem.modifier) parts.push(`modifier: ${def.bem.modifier}`);
      lines.push(`  BEM: ${parts.join(", ")}`);
    }
  }

  if (defs.length > 5) {
    lines.push(`- ... and ${defs.length - 5} more`);
  }

  return {
    className,
    contents: lines.join("\n"),
    definitionCount: defs.length,
  };
}
