import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lazy-loading tree-sitter manager.
 *
 * WASM grammars are loaded once and cached.  The manager resolves grammar
 * `.wasm` files relative to the directory that contains *this* module at
 * runtime – i.e. `dist/` when bundled, or the source tree during tests.
 *
 * Call `initTreeSitter()` once at startup; after that the cached `Parser` and
 * `Language` instances are available synchronously through `getParser()` and
 * `getLanguage()`.
 */

// We dynamically import web-tree-sitter so the rest of the codebase can be
// loaded even when tree-sitter is not installed / not used.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ParserClass: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let LanguageClass: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSParser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLanguage = any;

let initialized = false;
const languageCache = new Map<string, TSLanguage>();
const parserCache = new Map<string, TSParser>();

/**
 * The directory where grammar WASM files live.
 *
 * When bundled by esbuild the `.wasm` files are copied next to the output JS.
 * During vitest the files live in `node_modules/<pkg>/`.
 */
function wasmDir(): string {
  // __dirname equivalent for ESM
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
}

/**
 * Resolve the path to a grammar `.wasm` file.
 * Falls back to well-known `node_modules` paths when the file isn't next to
 * the running script (e.g. during tests).
 */
function resolveWasm(name: string): string {
  const dir = wasmDir();

  // 1. Bundled layout: dist/<name>.wasm
  const bundled = path.join(dir, `${name}.wasm`);

  // 2. node_modules layout: node_modules/<pkg>/<name>.wasm
  //    tree-sitter-typescript ships tsx as tree-sitter-tsx.wasm
  const pkg = name === "tree-sitter-tsx"
    ? "tree-sitter-typescript"
    : name;
  // During tests, wasmDir() points to src/parsers/treesitter — need 3 levels up
  // During bundled, wasmDir() points to dist/ — need 1 level up
  // We check both.
  const nmFromSrc = path.resolve(dir, "..", "..", "..", "node_modules", pkg, `${name}.wasm`);
  const nmFromDist = path.resolve(dir, "..", "node_modules", pkg, `${name}.wasm`);

  // Prefer bundled, fall back to node_modules
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    if (fs.existsSync(bundled)) return bundled;
    if (fs.existsSync(nmFromSrc)) return nmFromSrc;
    if (fs.existsSync(nmFromDist)) return nmFromDist;
  } catch { /* ignore */ }

  return nmFromSrc;
}

/**
 * Initialize the WASM runtime. Must be called once before any parsing.
 */
export async function initTreeSitter(): Promise<void> {
  if (initialized) return;

  const mod = await import("web-tree-sitter");
  ParserClass = mod.Parser;
  LanguageClass = mod.Language;

  // Locate the core WASM runtime — needed when bundled (dist/ layout)
  const runtimeWasm = resolveWasm("web-tree-sitter");
  const fsModule = await import("node:fs");

  // If the runtime WASM is next to our script (bundled), tell Parser where it is
  if (fsModule.existsSync(runtimeWasm)) {
    await ParserClass.init({
      locateFile(scriptName: string) {
        if (scriptName.endsWith(".wasm")) {
          return runtimeWasm;
        }
        return scriptName;
      },
    });
  } else {
    // web-tree-sitter can find its own WASM when installed via node_modules
    await ParserClass.init();
  }

  initialized = true;
}

/**
 * Load (and cache) a tree-sitter grammar.
 */
async function loadLanguage(name: string): Promise<TSLanguage> {
  const cached = languageCache.get(name);
  if (cached) return cached;

  if (!initialized) {
    throw new Error("Tree-sitter not initialized. Call initTreeSitter() first.");
  }

  const wasmPath = resolveWasm(name);
  const lang = await LanguageClass.load(wasmPath);
  languageCache.set(name, lang);
  return lang;
}

/**
 * Get (or create) a parser for the given grammar.
 */
async function getParserFor(grammarName: string): Promise<TSParser> {
  const cached = parserCache.get(grammarName);
  if (cached) return cached;

  const lang = await loadLanguage(grammarName);
  const parser = new ParserClass();
  parser.setLanguage(lang);
  parserCache.set(grammarName, parser);
  return parser;
}

/** Check whether tree-sitter has been initialized. */
export function isTreeSitterReady(): boolean {
  return initialized;
}

/**
 * Get a tree-sitter parser for CSS.
 */
export async function getCssParser(): Promise<TSParser> {
  return getParserFor("tree-sitter-css");
}

/**
 * Get a tree-sitter parser for HTML.
 */
export async function getHtmlParser(): Promise<TSParser> {
  return getParserFor("tree-sitter-html");
}

/**
 * Get a tree-sitter parser for JavaScript (JSX).
 */
export async function getJsxParser(): Promise<TSParser> {
  return getParserFor("tree-sitter-javascript");
}

/**
 * Get a tree-sitter parser for TypeScript with JSX (TSX).
 */
export async function getTsxParser(): Promise<TSParser> {
  return getParserFor("tree-sitter-tsx");
}

/**
 * Pre-load all grammars. Call during server initialization for best
 * first-parse latency.
 */
export async function preloadGrammars(): Promise<void> {
  await Promise.all([
    getCssParser(),
    getHtmlParser(),
    getJsxParser(),
    getTsxParser(),
  ]);
}
