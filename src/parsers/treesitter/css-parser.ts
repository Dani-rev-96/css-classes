import type { CssClassDefinition, CssClassesConfig } from "../../types.js";
import { parseBem } from "../../utils/bem.js";
import { getCssParser } from "./init.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;

/**
 * Parse CSS content using tree-sitter and extract all class definitions.
 *
 * This parser handles plain CSS.  For SCSS files (which use `&`, `@mixin`,
 * `$variables`, etc.) the caller should fall back to the regex-based parser
 * because tree-sitter-css does not understand SCSS-specific syntax.
 */
export async function parseCssClasses(
  content: string,
  filePath: string,
  config?: Partial<CssClassesConfig>,
): Promise<CssClassDefinition[]> {
  const bemEnabled = config?.bemEnabled ?? true;
  const elementSep = config?.bemSeparators?.element ?? "__";
  const modifierSep = config?.bemSeparators?.modifier ?? "--";

  const parser = await getCssParser();
  const tree = parser.parse(content);
  if (!tree) return [];

  const classes: CssClassDefinition[] = [];
  const seen = new Set<string>();

  try {
    walkRulesets(tree.rootNode, [], classes, seen, filePath, bemEnabled, elementSep, modifierSep);
  } finally {
    tree.delete();
  }

  return classes;
}

/**
 * Recursively walk the AST to extract class selectors from rule_set nodes.
 * Tracks nesting scope to resolve parent selectors (CSS nesting with `&`).
 */
function walkRulesets(
  node: TSNode,
  parentSelectors: string[],
  classes: CssClassDefinition[],
  seen: Set<string>,
  filePath: string,
  bemEnabled: boolean,
  elementSep: string,
  modifierSep: string,
): void {
  for (const child of node.namedChildren) {
    if (child.type === "rule_set") {
      processRuleSet(child, parentSelectors, classes, seen, filePath, bemEnabled, elementSep, modifierSep);
    } else if (child.type === "media_statement" || child.type === "supports_statement" || child.type === "at_rule" || child.type === "keyframes_statement" || child.type === "layer_statement" || child.type === "block") {
      // Recurse into at-rule blocks and block nodes that may contain rule_sets
      walkRulesets(child, parentSelectors, classes, seen, filePath, bemEnabled, elementSep, modifierSep);
    }
  }
}

/**
 * Process a single rule_set node: extract class selectors and recurse into
 * nested rule_sets (CSS nesting).
 */
function processRuleSet(
  ruleSet: TSNode,
  parentSelectors: string[],
  classes: CssClassDefinition[],
  seen: Set<string>,
  filePath: string,
  bemEnabled: boolean,
  elementSep: string,
  modifierSep: string,
): void {
  // Collect this rule's selectors text for nesting resolution
  const selectorsNode = ruleSet.childForFieldName("selectors") ?? findChildByType(ruleSet, "selectors");
  const rawSelector = selectorsNode ? selectorsNode.text : "";

  // Resolve selectors considering nesting
  const resolvedSelectors = resolveSelectors(rawSelector, parentSelectors);

  // Extract class names from all selector fragments
  const classNodes = selectorsNode ? collectClassSelectors(selectorsNode) : [];

  // Build a set of parent class names to avoid duplicating them
  const parentClasses = new Set<string>();
  for (const ps of parentSelectors) {
    for (const cls of extractClassNamesFromSelector(ps)) {
      parentClasses.add(cls);
    }
  }

  // Also extract class names from the resolved selectors (handles nesting)
  const allClassNames = new Set<string>();
  for (const sel of resolvedSelectors) {
    for (const cls of extractClassNamesFromSelector(sel)) {
      allClassNames.add(cls);
    }
  }

  // Register extracted classes
  for (const cn of classNodes) {
    const className = cn.text.startsWith(".") ? cn.text.slice(1) : cn.text;
    if (parentClasses.has(className)) continue;

    const key = `${className}:${cn.startPosition.row}:${cn.startPosition.column}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bem = bemEnabled ? parseBem(className, elementSep, modifierSep) : null;
    classes.push({
      className,
      filePath,
      line: cn.startPosition.row,
      column: cn.startPosition.column,
      endLine: cn.endPosition.row,
      endColumn: cn.endPosition.column,
      rawSelector,
      nested: parentSelectors.length > 0,
      bem,
    });
  }

  // For resolved nested classes that don't appear as direct class_selector nodes
  // (e.g. from CSS `&` nesting resolution), emit them too
  for (const cls of allClassNames) {
    if (parentClasses.has(cls)) continue;

    const key = `${cls}:resolved`;
    if (seen.has(key)) continue;

    // Check if we already emitted this class from a direct node
    const alreadyEmitted = classNodes.some((cn) => {
      const name = cn.text.startsWith(".") ? cn.text.slice(1) : cn.text;
      return name === cls;
    });
    if (alreadyEmitted) continue;

    seen.add(key);
    const bem = bemEnabled ? parseBem(cls, elementSep, modifierSep) : null;
    const startPos = selectorsNode?.startPosition ?? { row: 0, column: 0 };
    const endPos = selectorsNode?.endPosition ?? { row: 0, column: 0 };
    classes.push({
      className: cls,
      filePath,
      line: startPos.row,
      column: startPos.column,
      endLine: endPos.row,
      endColumn: endPos.column,
      rawSelector,
      nested: parentSelectors.length > 0,
      bem,
    });
  }

  // Recurse into the block for nested rule_sets
  const block = ruleSet.childForFieldName("block") ?? findChildByType(ruleSet, "block");
  if (block) {
    walkRulesets(block, resolvedSelectors, classes, seen, filePath, bemEnabled, elementSep, modifierSep);
  }
}

/**
 * Collect all class_selector nodes from a selectors subtree.
 */
function collectClassSelectors(node: TSNode): TSNode[] {
  const result: TSNode[] = [];
  if (node.type === "class_selector") {
    // The class name is the child with type "class_name"
    const nameNode = findChildByType(node, "class_name");
    if (nameNode) {
      result.push(nameNode);
    }
  }
  for (const child of node.namedChildren) {
    result.push(...collectClassSelectors(child));
  }
  return result;
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
 * Resolve selectors considering CSS nesting with `&`.
 */
function resolveSelectors(rawSelector: string, parentSelectors: string[]): string[] {
  const parts = rawSelector.split(",").map((s) => s.trim()).filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (parentSelectors.length === 0) {
      resolved.push(part);
      continue;
    }

    if (part.includes("&")) {
      for (const parent of parentSelectors) {
        resolved.push(part.replace(/&/g, parent));
      }
    } else {
      for (const parent of parentSelectors) {
        resolved.push(`${parent} ${part}`);
      }
    }
  }

  return resolved;
}

/**
 * Extract CSS class names from a selector string using a regex.
 */
function extractClassNamesFromSelector(selector: string): string[] {
  const classes: string[] = [];
  const regex = /\.(-?[_a-zA-Z][-\w]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(selector)) !== null) {
    classes.push(match[1]);
  }
  return classes;
}
