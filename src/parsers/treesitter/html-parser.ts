import type { CssClassReference } from "../../types.js";
import { getHtmlParser } from "./init.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;

/**
 * Parse HTML content using tree-sitter and extract class references from
 * class="..." attributes.
 *
 * Handles:
 *  - class="foo bar baz"
 *  - class='foo bar'
 *  - Multi-line class attributes
 *  - Multiple class attributes across the document
 */
export async function parseHtmlClasses(
  content: string,
  filePath: string,
): Promise<CssClassReference[]> {
  const parser = await getHtmlParser();
  const tree = parser.parse(content);
  if (!tree) return [];

  const refs: CssClassReference[] = [];

  try {
    collectClassAttributes(tree.rootNode, filePath, refs);
  } finally {
    tree.delete();
  }

  return refs;
}

/**
 * Recursively walk the HTML AST and extract class attributes.
 */
function collectClassAttributes(
  node: TSNode,
  filePath: string,
  refs: CssClassReference[],
): void {
  if (node.type === "attribute") {
    const nameNode = findChildByType(node, "attribute_name");
    if (nameNode && nameNode.text.toLowerCase() === "class") {
      const valueNode = findChildByType(node, "quoted_attribute_value");
      if (valueNode) {
        // The attribute_value is inside the quotes
        const innerNode = findChildByType(valueNode, "attribute_value");
        if (innerNode) {
          extractClassNames(innerNode.text, filePath, innerNode.startPosition.row, innerNode.startPosition.column, refs);
        } else {
          // Some tree-sitter versions put the text directly in quoted_attribute_value
          // Strip quotes manually
          const text = valueNode.text;
          const stripped = text.slice(1, -1); // remove quotes
          const startCol = valueNode.startPosition.column + 1; // skip opening quote
          extractClassNames(stripped, filePath, valueNode.startPosition.row, startCol, refs);
        }
      }
    }
    return; // no need to recurse into attributes
  }

  for (const child of node.namedChildren) {
    collectClassAttributes(child, filePath, refs);
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
 * Extract space-separated class names from a string, computing correct
 * line/column positions for each class name.
 */
function extractClassNames(
  classValue: string,
  filePath: string,
  startLine: number,
  startCol: number,
  refs: CssClassReference[],
): void {
  // Handle multi-line values
  const lines = classValue.split("\n");
  let currentLine = startLine;
  let currentOffset = 0;

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
    currentOffset += lineText.length + 1; // +1 for newline
  }
}
