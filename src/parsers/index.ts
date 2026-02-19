// Re-export the regex-based (default) parsers for direct usage
export { parseCssClasses, extractStyleBlocks, parseScssDirectives } from "./css-parser.js";
export { parseHtmlClasses } from "./html-parser.js";
export { parseVueClasses } from "./vue-parser.js";
export { parseReactClasses } from "./react-parser.js";

// Re-export tree-sitter parsers and initialization
export {
  initTreeSitter,
  isTreeSitterReady,
  preloadGrammars,
  tsParseCssClasses,
  tsParseHtmlClasses,
  tsParseReactClasses,
  tsParseVueClasses,
} from "./treesitter/index.js";
