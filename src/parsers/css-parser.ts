import type { CssClassDefinition, CssClassesConfig } from "../types.js";
import { parseBem } from "../utils/bem.js";

/**
 * Parse CSS/SCSS content and extract all class definitions.
 * Handles:
 *  - Plain CSS selectors: .foo, .bar
 *  - Comma-separated selectors: .foo, .bar { }
 *  - SCSS nesting with & (parent selector): .block { &__element { } &--modifier { } }
 *  - Deep nesting: .a { .b { &--c { } } }
 *  - Multiple classes in a compound selector: .foo.bar
 */
export function parseCssClasses(
  content: string,
  filePath: string,
  config?: Partial<CssClassesConfig>,
): CssClassDefinition[] {
  const bemEnabled = config?.bemEnabled ?? true;
  const elementSep = config?.bemSeparators?.element ?? "__";
  const modifierSep = config?.bemSeparators?.modifier ?? "--";
  const resolveNesting = config?.scssNesting ?? true;

  const classes: CssClassDefinition[] = [];
  const lines = content.split("\n");

  // State machine for tracking nesting
  interface ScopeFrame {
    /** The resolved parent class selectors at this nesting level */
    selectors: string[];
    /** Line where this scope started */
    line: number;
  }

  const scopeStack: ScopeFrame[] = [];
  let currentSelectors: string[] = [];
  let selectorBuffer = "";
  let selectorStartLine = 0;
  let selectorStartCol = 0;
  let inComment = false;
  let inLineComment = false;
  let inString: string | false = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    inLineComment = false;

    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      const next = col + 1 < line.length ? line[col + 1] : "";

      // Handle string literals
      if (inString) {
        if (ch === inString && (col === 0 || line[col - 1] !== "\\")) {
          inString = false;
        }
        continue;
      }

      // Handle comments
      if (inComment) {
        if (ch === "*" && next === "/") {
          inComment = false;
          col++; // skip /
        }
        continue;
      }

      if (inLineComment) continue;

      if (ch === "/" && next === "*") {
        inComment = true;
        col++;
        continue;
      }

      if (ch === "/" && next === "/") {
        inLineComment = true;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = ch;
        continue;
      }

      // Track selector starts
      if (selectorBuffer.length === 0 && ch !== " " && ch !== "\t" && ch !== "{" && ch !== "}" && ch !== ";") {
        selectorStartLine = lineIdx;
        selectorStartCol = col;
      }

      if (ch === "{") {
        // Process the selector buffer
        const rawSelector = selectorBuffer.trim();
        selectorBuffer = "";

        if (rawSelector) {
          const resolvedSelectors = resolveSelectors(
            rawSelector,
            scopeStack.length > 0 ? scopeStack[scopeStack.length - 1].selectors : [],
            resolveNesting,
          );

          // Extract classes from resolved selectors
          for (const sel of resolvedSelectors) {
            const extracted = extractClassesFromSelector(sel);
            for (const cls of extracted) {
              const bem = bemEnabled ? parseBem(cls, elementSep, modifierSep) : null;
              classes.push({
                className: cls,
                filePath,
                line: selectorStartLine,
                column: selectorStartCol,
                endLine: lineIdx,
                endColumn: col,
                rawSelector,
                nested: scopeStack.length > 0,
                bem,
              });
            }
          }

          scopeStack.push({
            selectors: resolvedSelectors,
            line: lineIdx,
          });
          currentSelectors = resolvedSelectors;
        } else {
          // Empty selector (e.g., @media block)
          scopeStack.push({
            selectors: scopeStack.length > 0 ? scopeStack[scopeStack.length - 1].selectors : [],
            line: lineIdx,
          });
        }
      } else if (ch === "}") {
        selectorBuffer = "";
        if (scopeStack.length > 0) {
          scopeStack.pop();
        }
      } else if (ch === ";") {
        // Property declaration, reset selector buffer
        selectorBuffer = "";
      } else {
        selectorBuffer += ch;
      }
    }

    // Add implicit newline separation in selector buffer
    if (selectorBuffer.length > 0 && !inComment) {
      selectorBuffer += " ";
    }
  }

  return classes;
}

/**
 * Resolve selectors considering SCSS nesting with `&` parent references.
 */
function resolveSelectors(
  rawSelector: string,
  parentSelectors: string[],
  resolveNesting: boolean,
): string[] {
  // Split comma-separated selectors
  const parts = splitSelectors(rawSelector);
  const resolved: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (!resolveNesting || parentSelectors.length === 0) {
      resolved.push(trimmed);
      continue;
    }

    if (trimmed.includes("&")) {
      // Replace & with each parent selector
      for (const parent of parentSelectors) {
        resolved.push(trimmed.replace(/&/g, parent));
      }
    } else {
      // Descendant combinator — append to each parent
      for (const parent of parentSelectors) {
        resolved.push(`${parent} ${trimmed}`);
      }
    }
  }

  return resolved;
}

/**
 * Split a selector string by commas, respecting parentheses.
 */
function splitSelectors(selector: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of selector) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Extract CSS class names from a resolved selector string.
 * E.g. ".foo .bar.baz > .qux" -> ["foo", "bar", "baz", "qux"]
 */
function extractClassesFromSelector(selector: string): string[] {
  const classes: string[] = [];
  // Match .className patterns — class names can contain letters, digits, hyphens, underscores
  const regex = /\.(-?[_a-zA-Z][-\w]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(selector)) !== null) {
    classes.push(match[1]);
  }

  return classes;
}

/**
 * Extract <style> block contents from a Vue/Svelte/HTML file.
 * Returns the content and the line offset of the style block.
 */
export function extractStyleBlocks(
  content: string,
): Array<{ content: string; lineOffset: number; lang: string }> {
  const blocks: Array<{ content: string; lineOffset: number; lang: string }> = [];
  const regex = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1] || "";
    const styleContent = match[2];
    const beforeStyle = content.slice(0, match.index);
    const lineOffset = beforeStyle.split("\n").length;

    // Detect lang attribute
    const langMatch = attrs.match(/lang\s*=\s*["'](\w+)["']/);
    const lang = langMatch ? langMatch[1] : "css";

    // Count the lines of the opening <style> tag itself
    const openingTag = content.slice(match.index, match.index + match[0].indexOf(">") + 1);
    const tagLines = openingTag.split("\n").length - 1;

    blocks.push({
      content: styleContent,
      lineOffset: lineOffset + tagLines,
      lang,
    });
  }

  return blocks;
}
