import type { CssClassesConfig, CssClassReference } from "../types.js";
import { parseHtmlClasses } from "../parsers/html-parser.js";
import { parseVueClasses } from "../parsers/vue-parser.js";
import { parseReactClasses } from "../parsers/react-parser.js";
import { getFileLanguage } from "../scanner/workspace-scanner.js";
import { getWordAtOffset, positionToOffset } from "../utils/position.js";
import { bemTargetAtOffset } from "../utils/bem.js";
import type { CssClassIndex } from "./css-index.js";

export interface DefinitionResult {
  className: string;
  definitions: Array<{
    filePath: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    rawSelector: string;
  }>;
}

/**
 * Given a cursor position in a template file, find the CSS class under the cursor
 * and return its definitions.
 */
export function getDefinition(
  content: string,
  filePath: string,
  line: number,
  column: number,
  index: CssClassIndex,
  config: CssClassesConfig,
): DefinitionResult | null {
  const lang = getFileLanguage(filePath, config);
  if (!lang) return null;

  // For CSS files, the class under cursor might itself be a selector
  if (lang === "css") {
    return getDefinitionInCss(content, line, column, index, config);
  }

  // For template files, find the class name at the cursor position
  const refs = getReferencesForFile(content, filePath, lang, config);
  const ref = findReferenceAtPosition(refs, line, column);

  if (!ref) {
    // Fallback: try to find a word at cursor position that matches a class
    return getDefinitionByWord(content, line, column, index, config);
  }

  // Resolve BEM part target based on cursor position within the class name
  const targetClassName = resolveBemTarget(ref, column, config);

  const defs = index.lookup(targetClassName);
  if (defs.length === 0) return null;

  return {
    className: targetClassName,
    definitions: defs.map((d) => ({
      filePath: d.filePath,
      line: d.line,
      column: d.column,
      endLine: d.endLine,
      endColumn: d.endColumn,
      rawSelector: d.rawSelector,
    })),
  };
}

/**
 * Get the class name at a specific position in a CSS file.
 */
function getDefinitionInCss(
  content: string,
  line: number,
  column: number,
  index: CssClassIndex,
  config: CssClassesConfig,
): DefinitionResult | null {
  return getDefinitionByWord(content, line, column, index, config);
}

/**
 * Fallback: get word at cursor and look it up.
 */
function getDefinitionByWord(
  content: string,
  line: number,
  column: number,
  index: CssClassIndex,
  config?: CssClassesConfig,
): DefinitionResult | null {
  const offset = positionToOffset(content, line, column);
  const word = getWordAtOffset(content, offset);

  if (!word) return null;

  // Apply BEM part resolution within the word
  let targetClassName = word.word;
  if (config?.bemEnabled && config?.bemDefinitionParts) {
    const cursorOffsetInWord = offset - word.start;
    targetClassName = bemTargetAtOffset(
      word.word,
      cursorOffsetInWord,
      config.bemSeparators.element,
      config.bemSeparators.modifier,
    );
  }

  const defs = index.lookup(targetClassName);
  if (defs.length === 0) return null;

  return {
    className: targetClassName,
    definitions: defs.map((d) => ({
      filePath: d.filePath,
      line: d.line,
      column: d.column,
      endLine: d.endLine,
      endColumn: d.endColumn,
      rawSelector: d.rawSelector,
    })),
  };
}

/**
 * Resolve the BEM target class name based on cursor position within a reference.
 * When bemDefinitionParts is enabled, the cursor position determines whether
 * to jump to the block, element, or modifier definition.
 */
function resolveBemTarget(
  ref: CssClassReference,
  cursorColumn: number,
  config: CssClassesConfig,
): string {
  if (!config.bemEnabled || !config.bemDefinitionParts) {
    return ref.className;
  }

  const offsetInClass = cursorColumn - ref.column;
  return bemTargetAtOffset(
    ref.className,
    offsetInClass,
    config.bemSeparators.element,
    config.bemSeparators.modifier,
  );
}

/**
 * Parse references for a specific file type.
 */
function getReferencesForFile(
  content: string,
  filePath: string,
  lang: "html" | "vue" | "react",
  _config: CssClassesConfig,
): CssClassReference[] {
  switch (lang) {
    case "html":
      return parseHtmlClasses(content, filePath);
    case "vue":
      return parseVueClasses(content, filePath);
    case "react":
      return parseReactClasses(content, filePath);
    default:
      return [];
  }
}

/**
 * Find a class reference that spans the given position.
 */
function findReferenceAtPosition(
  refs: CssClassReference[],
  line: number,
  column: number,
): CssClassReference | null {
  for (const ref of refs) {
    if (ref.line === line && column >= ref.column && column < ref.endColumn) {
      return ref;
    }
  }
  return null;
}
