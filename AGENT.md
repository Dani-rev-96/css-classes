# AGENT.md — css-classes-lsp

> Auto-maintained project tracking file optimized for AI agents.
> Last updated: 2026-02-18

## Project Overview

**css-classes-lsp** is a Language Server Protocol (LSP) server that enables navigation from CSS class name usage in template files to their definitions in CSS/SCSS stylesheets.

- **Transport**: stdio (Neovim LSP) / IPC (VS Code extension)
- **Target Editors**: VS Code 1.80+, Neovim 0.11.6+
- **Runtime**: Node.js >= 20
- **Language**: TypeScript (ES2022, Node16 modules)

## Status: Feature-Rich

### Completed

- [x] Project scaffolding (package.json, tsconfig, vitest)
- [x] Type system (`CssClassDefinition`, `CssClassReference`, `CssClassesConfig`)
- [x] CSS/SCSS parser with nesting resolution via `&` parent selector
- [x] BEM pattern parsing and detection (`block__element--modifier`)
- [x] HTML `class=""` parser (full-content, multi-line aware)
- [x] Vue `:class` parser (object `{}`, array `[]`, string `''`, `v-bind:class`) — full-content, multi-line aware
- [x] React `className` parser (static, dynamic, `clsx`/`classNames`/`cn`, CSS Modules) — full-content, multi-line aware
- [x] React template literal `${}` interpolation support (static segments + string literals inside expressions)
- [x] Workspace scanner (fast-glob based file discovery)
- [x] In-memory CSS class index (`CssClassIndex`) with O(1) lookup
- [x] Go-to-definition provider
- [x] Hover provider (shows definition count, file locations, BEM parts)
- [x] Completion provider (prefix + fuzzy matching)
- [x] **References provider** (find all usages of a class across template files)
- [x] **Diagnostics provider** (warn on undefined classes: `css-classes/undefined`, info on duplicates: `css-classes/duplicate-definition`)
- [x] **Workspace symbol provider** (search class definitions with prefix/contains/fuzzy matching)
- [x] **CSS `@import` / `@use` / `@forward` resolution** (follows import chains, resolves SCSS partials `_name.scss`, directory index files)
- [x] Context detection for completions (class="", className=, :class=, clsx(), styles.)
- [x] Configuration system with defaults and partial overrides
- [x] LSP server with full lifecycle (init, indexing, file watching, re-indexing)
- [x] Embedded `<style>` block extraction and indexing
- [x] File watcher integration for CSS/SCSS changes
- [x] Document save handler for re-indexing + diagnostics publishing
- [x] Document open handler for diagnostics publishing
- [x] **VS Code extension** (LanguageClient, contributes.configuration, esbuild bundling, launch.json debugging)
- [x] Neovim 0.11+ setup documentation
- [x] Test suite: 89 tests across 9 test files — all passing
- [x] Test fixtures (CSS, SCSS/BEM, SCSS imports/partials, HTML, Vue, React/TSX)
- [x] BEM-part-aware go-to-definition (jump to block, element, or modifier separately based on cursor position; configurable via `bemDefinitionParts`)
- [x] **SCSS `@extend`, `@mixin`, `@include` awareness** — parses directives, indexes relationships, shows `@extend` info in hover
- [x] **Rename provider** (rename class across templates + stylesheets via `textDocument/rename` with `prepareRename` support)
- [x] **Sourcemap support for CSS-in-JS** — resolves generated CSS positions back to original source via V3 source maps (inline + external)
- [x] **Experimental tree-sitter parser** — opt-in alternative parser backend behind `experimentalTreeSitter` config flag; uses web-tree-sitter WASM runtime with tree-sitter-css, tree-sitter-html, tree-sitter-javascript, tree-sitter-typescript grammars; SCSS files always fall back to regex parser

### Not Yet Implemented

- [ ] Performance optimization for very large projects (>10k CSS files)
- [ ] Less/Sass (indented syntax) support
- [ ] Svelte class:directive support
- [ ] Astro component support
- [ ] Tailwind @apply resolution
- [ ] CSS custom properties tracking

### Architecture Decisions

**Dual parser approach: Regex (default) + Tree-sitter (experimental)**

The parsers support two backends, selected via `experimentalTreeSitter` config flag (default: off):

**Regex parsers (default):**

- **CSS/SCSS**: Character-by-character state machine with scope stack for nesting. Handles comments, strings, `&` nesting, and selector extraction efficiently.
- **HTML/Vue/React**: Full-content regex matching with offset-to-line/column conversion. Handles multi-line attributes correctly.

**Tree-sitter parsers (experimental):**

- Uses `web-tree-sitter` (WASM runtime) for portability — no native bindings needed.
- Grammars: tree-sitter-css (.css only), tree-sitter-html, tree-sitter-javascript, tree-sitter-tsx.
- **SCSS always falls back to regex** — tree-sitter-css doesn't understand SCSS syntax (`&`, `@mixin`, `$variables`).
- Every tree-sitter call has try/catch fallback to the regex parser.
- WASM files are bundled into `dist/` at build time; grammar npm packages are devDependencies.
- Parser instances are cached — grammars loaded once during initialization.

**Why not ANTLR?** Wrong tool — Java-centric, no incremental parsing, requires maintaining custom grammars for languages that already have tree-sitter grammars.

## Architecture

```
src/
├── extension.ts           # VS Code extension client — LanguageClient setup,
│                            config forwarding from cssClasses.* settings
├── server.ts              # LSP entry point — stdio/IPC connection, lifecycle
├── config.ts              # Merges user config with DEFAULT_CONFIG
├── types.ts               # All shared interfaces and DEFAULT_CONFIG
├── core/
│   ├── css-index.ts       # CssClassIndex — in-memory Map<className, Definition[]>
│   │                        Follows @import/@use/@forward chains during indexing
│   ├── definition.ts      # getDefinition() — cursor → class → definitions
│   ├── hover.ts           # getHover() — class → markdown info
│   ├── completion.ts      # getCompletions() — prefix → CompletionItem[]
│   ├── references.ts      # getReferences() — class → all usages across workspace
│   ├── diagnostics.ts     # getDiagnostics() — undefined class warnings
│   ├── workspace-symbols.ts # getWorkspaceSymbols() — search definitions
│   ├── rename.ts          # getRename() — collect all edits for class rename
│   └── import-resolver.ts # extractImports(), resolveImportPath() — @import/@use/@forward
├── parsers/
│   ├── css-parser.ts      # parseCssClasses() — handles nesting, &, BEM
│   │                        extractStyleBlocks() — <style> extraction
│   │                        parseScssDirectives() — @mixin/@extend/@include extraction
│   ├── html-parser.ts     # parseHtmlClasses() — class="..." extraction (full-content)
│   ├── vue-parser.ts      # parseVueClasses() — static + dynamic :class (full-content)
│   ├── react-parser.ts    # parseReactClasses() — className, clsx, CSS Modules, template literals
│   └── treesitter/        # Tree-sitter WASM parser backend (experimental)
│       ├── init.ts        # initTreeSitter(), preloadGrammars() — WASM runtime + grammar cache
│       ├── css-parser.ts  # tsParseCssClasses() — tree-sitter CSS class extraction
│       ├── html-parser.ts # tsParseHtmlClasses() — tree-sitter HTML class extraction
│       ├── react-parser.ts# tsParseReactClasses() — tree-sitter JSX/TSX extraction
│       ├── vue-parser.ts  # tsParseVueClasses() — tree-sitter Vue template extraction
│       └── index.ts       # Barrel re-exports
├── scanner/
│   └── workspace-scanner.ts  # scanWorkspace(), scanTemplateFiles(), readFileContent()
└── utils/
    ├── bem.ts             # parseBem(), isBem(), bemParents()
    ├── position.ts        # positionToOffset(), offsetToPosition(), getWordAtOffset()
    └── sourcemap.ts       # parseSourceMap(), resolveOriginalPosition(), findSourceMap()
```

## Key Design Decisions

1. **No framework dependency** — Pure regex-based parsing. No dependency on PostCSS, SCSS compiler, Babel, or Vue compiler. This keeps the server fast and dependency-light.

2. **Incremental indexing** — The `CssClassIndex` supports per-file add/remove, so file changes don't require full re-indexing.

3. **Import chain resolution** — When indexing the workspace, `@import`, `@use`, and `@forward` statements are followed recursively. SCSS partial resolution (`_name.scss`) and directory index files (`_index.scss`) are supported.

4. **Configurable language support** — Each language (HTML/Vue/React) can be independently enabled/disabled. The server works with any combination.

5. **Complementary to framework LSPs** — This server only handles class name navigation. It's designed to run alongside Volar, tsserver, html-ls, etc. Neovim 0.11+ supports multiple LSPs per buffer natively.

6. **BEM-first** — BEM pattern detection is built into the CSS parser output, enabling future features like "jump to BEM block" or "show BEM tree".

## LSP Capabilities

| Feature           | Handler                           | Status |
| ----------------- | --------------------------------- | ------ |
| Go to Definition  | `textDocument/definition`         | ✅     |
| Hover             | `textDocument/hover`              | ✅     |
| Completion        | `textDocument/completion`         | ✅     |
| References        | `textDocument/references`         | ✅     |
| Workspace Symbols | `workspace/symbol`                | ✅     |
| Diagnostics       | `textDocument/publishDiagnostics` | ✅     |
| Rename            | `textDocument/rename`             | ✅     |
| Code Actions      | `textDocument/codeAction`         | ❌     |

## File Dependencies

```
server.ts → config.ts, types.ts, core/*, scanner/*, parsers/*
core/definition.ts → core/css-index.ts, parsers/*, scanner/*, utils/*
core/css-index.ts → parsers/css-parser.ts, scanner/*, core/import-resolver.ts, utils/sourcemap.ts
core/references.ts → parsers/*, scanner/*
core/diagnostics.ts → core/css-index.ts
core/workspace-symbols.ts → core/css-index.ts
core/rename.ts → parsers/*, scanner/*, core/css-index.ts
core/import-resolver.ts → scanner/workspace-scanner.ts
parsers/css-parser.ts → types.ts, utils/bem.ts
parsers/vue-parser.ts → types.ts, parsers/html-parser.ts
parsers/react-parser.ts → types.ts
parsers/html-parser.ts → types.ts
utils/bem.ts → types.ts
utils/position.ts → (standalone)
utils/sourcemap.ts → types.ts
config.ts → types.ts
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

**168 tests** across 13 test files:

- `test/css-parser.test.ts` — CSS parsing, SCSS nesting, BEM detection, style extraction (16)
- `test/html-parser.test.ts` — HTML class attribute extraction, positions (7)
- `test/vue-parser.test.ts` — Static, object, array, string, v-bind:class (10)
- `test/react-parser.test.ts` — className, clsx, classNames, cn, CSS Modules, template literals (10)
- `test/bem.test.ts` — BEM parsing, detection, parent resolution (25)
- `test/config.test.ts` — Config merging, defaults, type validation (8)
- `test/import-resolver.test.ts` — @import/@use/@forward extraction, SCSS partial resolution (13)
- `test/diagnostics.test.ts` — Undefined class warnings, duplicate definition detection (7)
- `test/workspace-symbols.test.ts` — Prefix/contains/fuzzy matching, limits (8)
- `test/scss-directives.test.ts` — @mixin, @extend, @include parsing and context resolution (16)
- `test/rename.test.ts` — Rename across CSS definitions and template references (7)
- `test/sourcemap.test.ts` — V3 source map parsing, VLQ decoding, position resolution (15)
- `test/treesitter.test.ts` — Tree-sitter CSS/HTML/React/Vue parsers: class extraction, positions, BEM, @media, modules (25)

## Build & Run

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript to dist/
node dist/server.js   # Run server (stdio mode)
```

## Configuration Reference

All settings go under `cssClasses` (or `css-classes`) key in LSP settings/initializationOptions:

| Key                      | Type       | Default                                                             |
| ------------------------ | ---------- | ------------------------------------------------------------------- |
| `includePatterns`        | `string[]` | `["**/*.css", "**/*.scss"]`                                         |
| `excludePatterns`        | `string[]` | `["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"]` |
| `languages.html`         | `bool`     | `true`                                                              |
| `languages.vue`          | `bool`     | `true`                                                              |
| `languages.react`        | `bool`     | `true`                                                              |
| `extensions.html`        | `string[]` | `[".html", ".htm"]`                                                 |
| `extensions.vue`         | `string[]` | `[".vue"]`                                                          |
| `extensions.react`       | `string[]` | `[".jsx", ".tsx"]`                                                  |
| `extensions.css`         | `string[]` | `[".css", ".scss"]`                                                 |
| `bemEnabled`             | `bool`     | `true`                                                              |
| `bemSeparators.element`  | `string`   | `"__"`                                                              |
| `bemSeparators.modifier` | `string`   | `"--"`                                                              |
| `scssNesting`            | `bool`     | `true`                                                              |
| `searchEmbeddedStyles`   | `bool`     | `true`                                                              |
| `experimentalTreeSitter` | `bool`     | `false`                                                             |

## Agent Instructions

When working on this project:

1. **Always update this file** after making structural changes, adding features, or fixing bugs.
2. **Run `npm test`** after any parser or core logic change to verify correctness.
3. **Run `npm run build`** to verify TypeScript compilation succeeds.
4. The CSS parser uses a manual state machine — be careful with brace counting and comment handling when modifying it.
5. Vue parser delegates static class parsing to the HTML parser — changes to HTML parser affect Vue.
6. The `CssClassIndex` is the single source of truth for all definitions. All providers query it.
7. The server uses stdio transport — no HTTP/WebSocket. This is the standard Neovim LSP transport.
8. All source uses `.js` extensions in imports (required for Node16 module resolution with ESM).
9. The HTML, Vue, and React parsers operate on full file content (not line-by-line) for multi-line support.
10. Import resolution follows SCSS conventions: partial prefix `_`, `.scss`/`.css` extension probing, directory index files.
