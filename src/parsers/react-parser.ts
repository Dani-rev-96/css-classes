import type { CssClassReference } from "../types.js";

/**
 * Parse React JSX/TSX content and extract class references.
 *
 * Handles:
 *  - className="foo bar"
 *  - className={'foo bar'}
 *  - className={`foo ${dynamic} bar`} — extracts static segments
 *  - className={clsx('foo', { bar: true })}
 *  - className={classNames('foo', condition && 'bar')}
 *  - className={cn('foo', 'bar')}
 *  - css modules: styles.className (extracted as "className")
 *  - css modules: styles['class-name'] (extracted as "class-name")
 *  - Multi-line expressions supported throughout
 */
export function parseReactClasses(
  content: string,
  filePath: string,
): CssClassReference[] {
  const refs: CssClassReference[] = [];

  // 1) className="..." or className='...' — multi-line aware
  parseStaticClassName(content, filePath, refs);

  // 2) className={...} — extract string/template literals from expression
  parseDynamicClassName(content, filePath, refs);

  // 3) clsx(...), classNames(...), cn(...) calls — extract string literals
  parseClassUtilityCalls(content, filePath, refs);

  // 4) CSS Modules: styles.className or styles['class-name']
  parseCssModuleAccess(content, filePath, refs);

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
 * Parse className="foo bar" or className='foo bar'
 */
function parseStaticClassName(
  content: string,
  filePath: string,
  refs: CssClassReference[],
): void {
  const regex = /\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const classValue = match[1] ?? match[2] ?? "";
    const quoteChar = match[0].includes('"') ? '"' : "'";
    const valueStart = match.index + match[0].indexOf(quoteChar) + 1;

    extractClassNames(classValue, filePath, content, valueStart, refs);
  }
}

/**
 * Parse className={...} expressions for string literals and template literals.
 * Handles multi-line expressions and template literals with ${} interpolation.
 */
function parseDynamicClassName(
  content: string,
  filePath: string,
  refs: CssClassReference[],
): void {
  const regex = /\bclassName\s*=\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const braceStart = match.index + match[0].length - 1;
    const expr = extractBracedExpression(content, braceStart);
    if (!expr) continue;

    const exprStart = braceStart + 1;

    // Extract all string/template literals from the expression
    extractStringLiterals(expr, filePath, content, exprStart, refs);

    // Extract from template literals with interpolation
    extractTemplateLiteralClasses(expr, filePath, content, exprStart, refs);
  }
}

/**
 * Parse utility function calls: clsx(...), classNames(...), cn(...)
 * Multi-line aware.
 */
function parseClassUtilityCalls(
  content: string,
  filePath: string,
  refs: CssClassReference[],
): void {
  const regex = /\b(?:clsx|classNames|classnames|cn|cx)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const parenStart = match.index + match[0].length - 1;
    const expr = extractParenExpression(content, parenStart);
    if (!expr) continue;

    const exprStart = parenStart + 1;

    // Extract string literals from the utility call
    extractStringLiterals(expr, filePath, content, exprStart, refs);

    // Extract from template literals
    extractTemplateLiteralClasses(expr, filePath, content, exprStart, refs);

    // Also handle object keys inside utility calls: cn({ 'active': true })
    extractObjectKeys(expr, filePath, content, exprStart, refs);
  }
}

/**
 * Parse CSS Module access patterns:
 *  - styles.className
 *  - styles['class-name']
 *  - styles["class-name"]
 */
function parseCssModuleAccess(
  content: string,
  filePath: string,
  refs: CssClassReference[],
): void {
  // Dot access: styles.className
  const dotRegex = /\bstyles\.([a-zA-Z_][\w]*)/g;
  let match: RegExpExecArray | null;

  while ((match = dotRegex.exec(content)) !== null) {
    const className = match[1];
    const offset = match.index + match[0].indexOf(className);
    const { line, col } = offsetToLineCol(content, offset);
    refs.push({
      className,
      filePath,
      line,
      column: col,
      endColumn: col + className.length,
    });
  }

  // Bracket access: styles['class-name'] or styles["class-name"]
  const bracketRegex = /\bstyles\[['"]([^'"]+)['"]\]/g;
  while ((match = bracketRegex.exec(content)) !== null) {
    const className = match[1];
    const offset = match.index + match[0].indexOf(className);
    const { line, col } = offsetToLineCol(content, offset);
    refs.push({
      className,
      filePath,
      line,
      column: col,
      endColumn: col + className.length,
    });
  }
}

/**
 * Extract a brace-delimited expression from content, handling nesting.
 * Works across multiple lines.
 */
function extractBracedExpression(content: string, start: number): string | null {
  if (content[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < content.length; i++) {
    if (content[i] === "{") depth++;
    if (content[i] === "}") depth--;
    if (depth === 0) return content.slice(start + 1, i);
  }
  return content.slice(start + 1); // unclosed, return what we have
}

/**
 * Extract a paren-delimited expression from content.
 * Works across multiple lines.
 */
function extractParenExpression(content: string, start: number): string | null {
  if (content[start] !== "(") return null;
  let depth = 0;
  for (let i = start; i < content.length; i++) {
    if (content[i] === "(") depth++;
    if (content[i] === ")") depth--;
    if (depth === 0) return content.slice(start + 1, i);
  }
  return content.slice(start + 1);
}

/**
 * Extract class names from space-separated strings.
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
    const offset = valueStartOffset + match.index;
    const { line, col } = offsetToLineCol(fullContent, offset);
    refs.push({
      className,
      filePath,
      line,
      column: col,
      endColumn: col + className.length,
    });
  }
}

/**
 * Extract string literals from JavaScript expressions.
 */
function extractStringLiterals(
  expr: string,
  filePath: string,
  fullContent: string,
  exprStartOffset: number,
  refs: CssClassReference[],
): void {
  // Single/double quoted strings
  const stringRegex = /['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = stringRegex.exec(expr)) !== null) {
    const value = match[1];
    const offset = exprStartOffset + match.index + 1;
    extractClassNames(value, filePath, fullContent, offset, refs);
  }
}

/**
 * Extract class names from template literals, including those with ${} interpolation.
 * Extracts the static text segments and treats them as space-separated class names.
 *
 * E.g. `card ${isActive ? 'active' : ''} highlighted`
 *   → extracts "card" from before ${}, "highlighted" from after
 *   → also extracts 'active' from inside the ${}
 */
function extractTemplateLiteralClasses(
  expr: string,
  filePath: string,
  fullContent: string,
  exprStartOffset: number,
  refs: CssClassReference[],
): void {
  // Match complete template literals including those with interpolation
  const templateRegex = /`((?:[^`\\]|\\.)*)`/g;
  let match: RegExpExecArray | null;

  while ((match = templateRegex.exec(expr)) !== null) {
    const templateBody = match[1];
    const templateStart = exprStartOffset + match.index + 1; // +1 for backtick

    // Split on ${...} expressions, extracting static segments
    let pos = 0;
    let segmentStart = 0;

    while (pos < templateBody.length) {
      if (templateBody[pos] === "$" && pos + 1 < templateBody.length && templateBody[pos + 1] === "{") {
        // Extract static segment before the interpolation
        if (pos > segmentStart) {
          const segment = templateBody.slice(segmentStart, pos);
          extractClassNames(segment, filePath, fullContent, templateStart + segmentStart, refs);
        }

        // Find matching closing brace for the interpolation
        let depth = 0;
        let i = pos + 1;
        for (; i < templateBody.length; i++) {
          if (templateBody[i] === "{") depth++;
          if (templateBody[i] === "}") {
            depth--;
            if (depth === 0) break;
          }
        }

        // Also extract string literals from inside the interpolation expression
        if (i > pos + 2) {
          const interpolationExpr = templateBody.slice(pos + 2, i);
          const interpolationOffset = templateStart + pos + 2;
          extractStringLiterals(interpolationExpr, filePath, fullContent, interpolationOffset, refs);
        }

        pos = i + 1;
        segmentStart = pos;
      } else {
        pos++;
      }
    }

    // Extract trailing static segment
    if (segmentStart < templateBody.length) {
      const segment = templateBody.slice(segmentStart);
      extractClassNames(segment, filePath, fullContent, templateStart + segmentStart, refs);
    }
  }
}

/**
 * Extract object keys from JS object expressions inside utility calls.
 * E.g. { 'active': true, disabled: false }
 */
function extractObjectKeys(
  expr: string,
  filePath: string,
  fullContent: string,
  exprStartOffset: number,
  refs: CssClassReference[],
): void {
  // Find all object literals within the expression
  const objRegex = /\{([^}]*)\}/g;
  let objMatch: RegExpExecArray | null;

  while ((objMatch = objRegex.exec(expr)) !== null) {
    const objContent = objMatch[1];
    const objStart = exprStartOffset + objMatch.index + 1;

    // Quoted keys: 'key': value or "key": value
    const quotedKeyRegex = /['"]([^'"]+)['"]\s*:/g;
    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = quotedKeyRegex.exec(objContent)) !== null) {
      const className = keyMatch[1];
      const offset = objStart + keyMatch.index + 1;
      extractClassNames(className, filePath, fullContent, offset, refs);
    }

    // Unquoted keys: key: value
    const unquotedKeyRegex = /(?:^|,)\s*([a-zA-Z_][\w-]*)\s*:/g;
    while ((keyMatch = unquotedKeyRegex.exec(objContent)) !== null) {
      const className = keyMatch[1];
      const offset = objStart + keyMatch.index + keyMatch[0].indexOf(className);
      const { line, col } = offsetToLineCol(fullContent, offset);
      refs.push({
        className,
        filePath,
        line,
        column: col,
        endColumn: col + className.length,
      });
    }
  }
}
