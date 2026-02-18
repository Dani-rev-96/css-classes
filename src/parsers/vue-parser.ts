import type { CssClassReference } from "../types.js";
import { parseHtmlClasses } from "./html-parser.js";

/**
 * Parse Vue template content and extract class references.
 *
 * Handles:
 *  - Static:  class="foo bar"
 *  - Bound object:  :class="{ 'foo-bar': condition, active: isActive }" (single + multi-line)
 *  - Bound array:   :class="['foo', condition ? 'bar' : 'baz']" (single + multi-line)
 *  - Bound string:  :class="'foo bar'"
 *  - v-bind:class   (alias for :class)
 *  - Mixed:  class="static" :class="{ dynamic: true }"
 */
export function parseVueClasses(
  content: string,
  filePath: string,
): CssClassReference[] {
  const refs: CssClassReference[] = [];

  // First: extract the <template> section for parsing
  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const templateContent = templateMatch ? templateMatch[1] : content;
  const templateOffset = templateMatch
    ? content.slice(0, templateMatch.index! + templateMatch[0].indexOf(">") + 1).split("\n").length - 1
    : 0;

  // 1) Static class="" attributes (reuse HTML parser logic on the template section)
  const staticRefs = parseHtmlClasses(templateContent, filePath);
  for (const ref of staticRefs) {
    refs.push({
      ...ref,
      line: ref.line + templateOffset,
    });
  }

  // 2) Dynamic :class or v-bind:class — match across multiple lines
  const dynamicRegex = /(?::class|v-bind:class)\s*=\s*"([^"]*)"/gi;
  let match: RegExpExecArray | null;

  while ((match = dynamicRegex.exec(templateContent)) !== null) {
    const expr = match[1];
    const exprOffset = match.index + match[0].indexOf('"') + 1;

    // Parse the expression — which may be multi-line — for class names
    parseDynamicClassExpr(expr, filePath, templateContent, exprOffset, templateOffset, refs);
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
 * Parse a Vue dynamic class expression and extract class name strings.
 * Handles multi-line expressions correctly by tracking offsets.
 */
function parseDynamicClassExpr(
  expr: string,
  filePath: string,
  fullContent: string,
  exprStartOffset: number,
  templateOffset: number,
  refs: CssClassReference[],
): void {
  const trimmed = expr.trim();

  if (trimmed.startsWith("{")) {
    parseObjectSyntax(expr, filePath, fullContent, exprStartOffset, templateOffset, refs);
  } else if (trimmed.startsWith("[")) {
    parseArraySyntax(expr, filePath, fullContent, exprStartOffset, templateOffset, refs);
  } else {
    extractStringLiterals(expr, filePath, fullContent, exprStartOffset, templateOffset, refs);
  }
}

/**
 * Parse Vue object syntax: { 'class-name': cond, active: cond }
 * Works correctly with multi-line objects.
 */
function parseObjectSyntax(
  expr: string,
  filePath: string,
  fullContent: string,
  exprStartOffset: number,
  templateOffset: number,
  refs: CssClassReference[],
): void {
  // Match quoted keys: 'key' or "key"
  const quotedKeyRegex = /['"]([^'"]+)['"]\s*:/g;
  let match: RegExpExecArray | null;

  while ((match = quotedKeyRegex.exec(expr)) !== null) {
    const className = match[1];
    const charOffset = exprStartOffset + match.index + 1; // +1 for the quote
    const { line, col } = offsetToLineCol(fullContent, charOffset);
    addClassRefs(className, filePath, line + templateOffset, col, refs);
  }

  // Match unquoted identifier keys: { active: true, disabled: false }
  const unquotedKeyRegex = /(?:[{,])\s*([a-zA-Z_][\w-]*)\s*:/g;
  while ((match = unquotedKeyRegex.exec(expr)) !== null) {
    const className = match[1];
    const classNameIdx = match.index + match[0].indexOf(className);
    const charOffset = exprStartOffset + classNameIdx;
    const { line, col } = offsetToLineCol(fullContent, charOffset);
    addClassRefs(className, filePath, line + templateOffset, col, refs);
  }
}

/**
 * Parse Vue array syntax: ['class-a', cond ? 'class-b' : 'class-c']
 */
function parseArraySyntax(
  expr: string,
  filePath: string,
  fullContent: string,
  exprStartOffset: number,
  templateOffset: number,
  refs: CssClassReference[],
): void {
  extractStringLiterals(expr, filePath, fullContent, exprStartOffset, templateOffset, refs);
}

/**
 * Find all string literals in an expression and treat them as class names.
 * Resolves positions correctly for multi-line expressions.
 */
function extractStringLiterals(
  expr: string,
  filePath: string,
  fullContent: string,
  exprStartOffset: number,
  templateOffset: number,
  refs: CssClassReference[],
): void {
  const stringRegex = /['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = stringRegex.exec(expr)) !== null) {
    const value = match[1];
    const charOffset = exprStartOffset + match.index + 1; // +1 for quote
    const { line, col } = offsetToLineCol(fullContent, charOffset);
    addClassRefs(value, filePath, line + templateOffset, col, refs);
  }
}

/**
 * Add one or more class references from a potentially space-separated string.
 */
function addClassRefs(
  classString: string,
  filePath: string,
  line: number,
  startCol: number,
  refs: CssClassReference[],
): void {
  const classRegex = /([-\w]+)/g;
  let match: RegExpExecArray | null;

  while ((match = classRegex.exec(classString)) !== null) {
    const className = match[1];
    const col = startCol + match.index;
    refs.push({
      className,
      filePath,
      line,
      column: col,
      endColumn: col + className.length,
    });
  }
}
