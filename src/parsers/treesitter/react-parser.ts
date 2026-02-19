import type { CssClassReference } from "../../types.js";
import { getTsxParser, getJsxParser } from "./init.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;

/**
 * Parse React JSX/TSX content using tree-sitter and extract class references.
 *
 * Handles:
 *  - className="foo bar"
 *  - className={'foo bar'}
 *  - className={`foo ${dynamic} bar`} — extracts static segments
 *  - className={clsx('foo', { bar: true })}
 *  - className={classNames('foo', condition && 'bar')}
 *  - className={cn('foo', 'bar')}
 *  - css modules: styles.className
 *  - css modules: styles['class-name']
 */
export async function parseReactClasses(
  content: string,
  filePath: string,
): Promise<CssClassReference[]> {
  // Determine parser based on file extension
  const isTsx = filePath.endsWith(".tsx") || filePath.endsWith(".ts");
  const parser = isTsx ? await getTsxParser() : await getJsxParser();
  const tree = parser.parse(content);
  if (!tree) return [];

  const refs: CssClassReference[] = [];

  try {
    walkTree(tree.rootNode, filePath, refs);
  } finally {
    tree.delete();
  }

  return refs;
}

/**
 * Walk the entire tree looking for JSX attributes and utility function calls.
 */
function walkTree(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  // JSX attribute: className="..." or className={...}
  if (node.type === "jsx_attribute") {
    processJsxAttribute(node, filePath, refs);
    return;
  }

  // Call expression: clsx(...), classNames(...), cn(...), cx(...)
  if (node.type === "call_expression") {
    processCallExpression(node, filePath, refs);
  }

  // CSS Module access: styles.className or styles['class-name']
  if (node.type === "member_expression") {
    processMemberExpression(node, filePath, refs);
  }

  if (node.type === "subscript_expression") {
    processSubscriptExpression(node, filePath, refs);
  }

  for (const child of node.namedChildren) {
    walkTree(child, filePath, refs);
  }
}

/**
 * Process a JSX attribute node (e.g. className="foo bar").
 */
function processJsxAttribute(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  // Check that the attribute name is "className"
  const nameNode = node.namedChildren.find((c: TSNode) =>
    c.type === "property_identifier" || c.type === "jsx_attribute_name",
  );
  if (!nameNode || nameNode.text !== "className") return;

  // Get the attribute value
  for (const child of node.namedChildren) {
    if (child.type === "string" || child.type === "string_fragment") {
      // className="foo bar"
      const text = stripQuotes(child.text);
      const startCol = child.startPosition.column + (child.text.startsWith('"') || child.text.startsWith("'") ? 1 : 0);
      extractClassNames(text, filePath, child.startPosition.row, startCol, refs);
    } else if (child.type === "jsx_expression") {
      // className={...}
      processJsxExpression(child, filePath, refs);
    }
  }
}

/**
 * Process a JSX expression containing class references.
 */
function processJsxExpression(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  for (const child of node.namedChildren) {
    extractStringsFromExpression(child, filePath, refs);
  }
}

/**
 * Extract class names from any expression node recursively.
 * Handles strings, template literals, objects, arrays, ternaries, etc.
 */
function extractStringsFromExpression(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  if (node.type === "string" || node.type === "string_fragment") {
    const text = stripQuotes(node.text);
    const startCol = node.startPosition.column + (node.text.startsWith('"') || node.text.startsWith("'") ? 1 : 0);
    extractClassNames(text, filePath, node.startPosition.row, startCol, refs);
    return;
  }

  if (node.type === "template_string") {
    // Extract static segments from template literals
    for (const child of node.children) {
      if (child.type === "string_fragment" || child.type === "template_fragment") {
        // This is a static part of the template
        extractClassNames(child.text, filePath, child.startPosition.row, child.startPosition.column, refs);
      } else if (child.type === "template_substitution") {
        // Recurse into ${...} for string literals inside
        for (const sub of child.namedChildren) {
          extractStringsFromExpression(sub, filePath, refs);
        }
      }
    }
    return;
  }

  // For objects: { 'active': cond } — extract keys
  if (node.type === "object") {
    for (const prop of node.namedChildren) {
      if (prop.type === "pair" || prop.type === "property") {
        const key = prop.namedChildren[0];
        if (key) {
          if (key.type === "string" || key.type === "string_fragment") {
            const text = stripQuotes(key.text);
            const startCol = key.startPosition.column + (key.text.startsWith('"') || key.text.startsWith("'") ? 1 : 0);
            extractClassNames(text, filePath, key.startPosition.row, startCol, refs);
          } else if (key.type === "property_identifier" || key.type === "shorthand_property_identifier" || key.type === "shorthand_property_identifier_pattern") {
            refs.push({
              className: key.text,
              filePath,
              line: key.startPosition.row,
              column: key.startPosition.column,
              endColumn: key.startPosition.column + key.text.length,
            });
          }
        }
      }
    }
    return;
  }

  // CSS Module member access: styles.className
  if (node.type === "member_expression") {
    const obj = node.childForFieldName("object");
    const prop = node.childForFieldName("property");
    if (obj && prop && obj.type === "identifier" && prop.type === "property_identifier") {
      refs.push({
        className: prop.text,
        filePath,
        line: prop.startPosition.row,
        column: prop.startPosition.column,
        endColumn: prop.startPosition.column + prop.text.length,
      });
    }
    return;
  }

  // CSS Module subscript access: styles['class-name']
  if (node.type === "subscript_expression") {
    const idx = node.childForFieldName("index");
    if (idx && (idx.type === "string" || idx.type === "string_fragment")) {
      const className = stripQuotes(idx.text);
      const startCol = idx.startPosition.column + (idx.text.startsWith('"') || idx.text.startsWith("'") ? 1 : 0);
      refs.push({
        className,
        filePath,
        line: idx.startPosition.row,
        column: startCol,
        endColumn: startCol + className.length,
      });
    }
    return;
  }

  // Recurse into all other expression types
  for (const child of node.namedChildren) {
    extractStringsFromExpression(child, filePath, refs);
  }
}

/**
 * Process a call expression to check for class utility functions.
 */
function processCallExpression(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  const funcNode = node.childForFieldName("function");
  if (!funcNode) return;

  const funcName = funcNode.text;
  if (!["clsx", "classNames", "classnames", "cn", "cx"].includes(funcName)) return;

  const argsNode = node.childForFieldName("arguments");
  if (!argsNode) return;

  for (const arg of argsNode.namedChildren) {
    extractStringsFromExpression(arg, filePath, refs);
  }
}

/**
 * Process member_expression for CSS Modules: styles.className
 */
function processMemberExpression(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  const obj = node.childForFieldName("object");
  const prop = node.childForFieldName("property");

  if (obj && prop && obj.text === "styles" && prop.type === "property_identifier") {
    refs.push({
      className: prop.text,
      filePath,
      line: prop.startPosition.row,
      column: prop.startPosition.column,
      endColumn: prop.startPosition.column + prop.text.length,
    });
  }
}

/**
 * Process subscript_expression for CSS Modules: styles['class-name']
 */
function processSubscriptExpression(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  const obj = node.childForFieldName("object");
  const idx = node.childForFieldName("index");

  if (obj && idx && obj.text === "styles" && (idx.type === "string" || idx.type === "string_fragment")) {
    const className = stripQuotes(idx.text);
    const startCol = idx.startPosition.column + (idx.text.startsWith('"') || idx.text.startsWith("'") ? 1 : 0);
    refs.push({
      className,
      filePath,
      line: idx.startPosition.row,
      column: startCol,
      endColumn: startCol + className.length,
    });
  }
}

/**
 * Strip surrounding quotes from a string.
 */
function stripQuotes(text: string): string {
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Extract space-separated class names from a string value.
 */
function extractClassNames(
  classValue: string,
  filePath: string,
  startLine: number,
  startCol: number,
  refs: CssClassReference[],
): void {
  const lines = classValue.split("\n");
  let currentLine = startLine;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const lineStart = i === 0 ? startCol : 0;
    const regex = /([-\w]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      const className = match[1];
      const col = lineStart + match.index;

      refs.push({
        className,
        filePath,
        line: currentLine,
        column: col,
        endColumn: col + className.length,
      });
    }

    currentLine++;
  }
}
