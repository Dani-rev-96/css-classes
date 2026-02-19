import type { CssClassReference } from "../../types.js";
import { getHtmlParser } from "./init.js";
import { parseHtmlClasses as tsParseHtmlClasses } from "./html-parser.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;

/**
 * Parse Vue template content using tree-sitter and extract class references.
 *
 * Handles:
 *  - Static:  class="foo bar"
 *  - Bound object:  :class="{ 'foo-bar': condition, active: isActive }"
 *  - Bound array:   :class="['foo', condition ? 'bar' : 'baz']"
 *  - Bound string:  :class="'foo bar'"
 *  - v-bind:class   (alias for :class)
 *  - Mixed:  class="static" :class="{ dynamic: true }"
 */
export async function parseVueClasses(
  content: string,
  filePath: string,
): Promise<CssClassReference[]> {
  const refs: CssClassReference[] = [];

  // Extract the <template> section
  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const templateContent = templateMatch ? templateMatch[1] : content;
  const templateOffset = templateMatch
    ? content.slice(0, templateMatch.index! + templateMatch[0].indexOf(">") + 1).split("\n").length - 1
    : 0;

  // 1) Static class="" attributes — use HTML tree-sitter parser
  const staticRefs = await tsParseHtmlClasses(templateContent, filePath);
  for (const ref of staticRefs) {
    refs.push({
      ...ref,
      line: ref.line + templateOffset,
    });
  }

  // 2) Dynamic :class or v-bind:class — parse with HTML tree-sitter then
  //    extract Vue-specific binding values
  const parser = await getHtmlParser();
  const tree = parser.parse(templateContent);
  if (!tree) return refs;

  try {
    collectDynamicClassBindings(tree.rootNode, filePath, templateOffset, refs);
  } finally {
    tree.delete();
  }

  return refs;
}

/**
 * Walk the HTML AST and find dynamic class bindings (:class, v-bind:class).
 */
function collectDynamicClassBindings(
  node: TSNode,
  filePath: string,
  templateOffset: number,
  refs: CssClassReference[],
): void {
  if (node.type === "attribute") {
    const nameNode = findChildByType(node, "attribute_name");
    if (nameNode) {
      const attrName = nameNode.text.toLowerCase();
      if (attrName === ":class" || attrName === "v-bind:class") {
        const valueNode = findChildByType(node, "quoted_attribute_value");
        if (valueNode) {
          // Get the expression text inside the quotes
          const innerNode = findChildByType(valueNode, "attribute_value");
          const expr = innerNode ? innerNode.text : stripQuotes(valueNode.text);
          const startRow = (innerNode ?? valueNode).startPosition.row;
          const startCol = innerNode
            ? innerNode.startPosition.column
            : valueNode.startPosition.column + 1;

          parseDynamicClassExpr(expr, filePath, startRow + templateOffset, startCol, refs);
        }
      }
    }
    return;
  }

  for (const child of node.namedChildren) {
    collectDynamicClassBindings(child, filePath, templateOffset, refs);
  }
}

/**
 * Parse a Vue dynamic class expression and extract class names.
 */
function parseDynamicClassExpr(
  expr: string,
  filePath: string,
  startLine: number,
  startCol: number,
  refs: CssClassReference[],
): void {
  const trimmed = expr.trim();

  if (trimmed.startsWith("{")) {
    parseObjectSyntax(expr, filePath, startLine, startCol, refs);
  } else if (trimmed.startsWith("[")) {
    parseArraySyntax(expr, filePath, startLine, startCol, refs);
  } else {
    extractStringLiterals(expr, filePath, startLine, startCol, refs);
  }
}

/**
 * Parse object syntax: { 'class-name': cond, active: cond }
 */
function parseObjectSyntax(
  expr: string,
  filePath: string,
  startLine: number,
  startCol: number,
  refs: CssClassReference[],
): void {
  // Quoted keys: 'key' or "key"
  const quotedKeyRegex = /['"]([^'"]+)['"]\s*:/g;
  let match: RegExpExecArray | null;

  while ((match = quotedKeyRegex.exec(expr)) !== null) {
    const className = match[1];
    const col = startCol + match.index + 1; // +1 for the quote
    addClassRefs(className, filePath, startLine, col, refs);
  }

  // Unquoted identifier keys: { active: true, disabled: false }
  const unquotedKeyRegex = /(?:[{,])\s*([a-zA-Z_][\w-]*)\s*:/g;
  while ((match = unquotedKeyRegex.exec(expr)) !== null) {
    const className = match[1];
    const col = startCol + match.index + match[0].indexOf(className);
    addClassRefs(className, filePath, startLine, col, refs);
  }
}

/**
 * Parse array syntax: ['class-a', cond ? 'class-b' : 'class-c']
 */
function parseArraySyntax(
  expr: string,
  filePath: string,
  startLine: number,
  startCol: number,
  refs: CssClassReference[],
): void {
  extractStringLiterals(expr, filePath, startLine, startCol, refs);
}

/**
 * Extract string literals from an expression.
 */
function extractStringLiterals(
  expr: string,
  filePath: string,
  startLine: number,
  startCol: number,
  refs: CssClassReference[],
): void {
  const stringRegex = /['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = stringRegex.exec(expr)) !== null) {
    const value = match[1];
    const col = startCol + match.index + 1; // +1 for quote
    addClassRefs(value, filePath, startLine, col, refs);
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

/**
 * Find a direct child node by type.
 */
function findChildByType(node: TSNode, type: string): TSNode | null {
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

/**
 * Strip surrounding quotes.
 */
function stripQuotes(text: string): string {
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
