/**
 * Convert a zero-based line+column to a character offset in text.
 */
export function positionToOffset(text: string, line: number, column: number): number {
  let offset = 0;
  const lines = text.split("\n");
  for (let i = 0; i < line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  return offset + column;
}

/**
 * Convert a character offset to a zero-based line+column.
 */
export function offsetToPosition(text: string, offset: number): { line: number; column: number } {
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
  return { line, column: col };
}

/**
 * Get the word/class under the cursor at a given offset in text.
 * Returns the class name and its start/end offsets.
 */
export function getWordAtOffset(
  text: string,
  offset: number,
): { word: string; start: number; end: number } | null {
  if (offset < 0 || offset >= text.length) return null;

  // CSS class name characters
  const isClassChar = (ch: string) => /[-\w]/.test(ch);

  if (!isClassChar(text[offset])) return null;

  let start = offset;
  let end = offset;

  while (start > 0 && isClassChar(text[start - 1])) start--;
  while (end < text.length - 1 && isClassChar(text[end + 1])) end++;

  return {
    word: text.slice(start, end + 1),
    start,
    end: end + 1,
  };
}
