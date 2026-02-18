import type { CssClassReference } from "../types.js";

/**
 * Parse HTML content and extract class references from class="..." attributes.
 *
 * Handles:
 *  - class="foo bar baz"
 *  - class='foo bar'
 *  - Multi-line class attributes
 *  - Multiple class attributes across the document
 */
export function parseHtmlClasses(
  content: string,
  filePath: string,
): CssClassReference[] {
  const refs: CssClassReference[] = [];

  // Match class="..." or class='...' across the full content (multi-line aware)
  const attrRegex = /(?<!:)\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(content)) !== null) {
    const classValue = match[1] ?? match[2] ?? "";
    const quoteChar = match[0].includes('"') ? '"' : "'";
    const valueStart = match.index + match[0].indexOf(quoteChar) + 1;

    extractClassNames(classValue, filePath, content, valueStart, refs);
  }

  return refs;
}

/**
 * Convert a character offset to a line+col pair within text.
 */
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 0;
  let col = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      col = 0;
    } else {
      col++;
    }
  }
  return { line, col };
}

/**
 * Split a space-separated class string and generate references.
 * Handles multi-line values by computing correct line/col from offsets.
 */
function extractClassNames(
  classValue: string,
  filePath: string,
  fullContent: string,
  valueStartOffset: number,
  refs: CssClassReference[],
): void {
  const regex = /([-\w]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(classValue)) !== null) {
    const className = match[1];
    const charOffset = valueStartOffset + match.index;
    const { line, col } = offsetToLineCol(fullContent, charOffset);

    refs.push({
      className,
      filePath,
      line,
      column: col,
      endColumn: col + className.length,
    });
  }
}
