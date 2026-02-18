# css-classes-lsp

A Language Server for CSS class name navigation. Jump from class usage in HTML, Vue, or React templates directly to the CSS/SCSS definition.

## Features

- **Go to Definition** — Click on any class name in your template and jump to its CSS/SCSS definition
- **Hover Information** — See where a class is defined and its BEM breakdown
- **Completion** — Get class name suggestions from your project's stylesheets
- **Multi-framework** — Supports HTML, Vue, and React (JSX/TSX) templates
- **SCSS Nesting** — Resolves `&` parent selectors to produce full class names
- **BEM Awareness** — Understands `block__element--modifier` patterns
- **Embedded Styles** — Indexes `<style>` blocks in Vue/HTML files
- **Configurable** — Enable/disable languages, customize patterns, BEM separators, etc.
- **Standalone** — Works independently or alongside framework LSPs (Volar, tsserver, etc.)

## Supported Class Syntaxes

### HTML

```html
<div class="card card--featured"></div>
```

### Vue

```vue
<!-- Static -->
<div class="card"></div>

<!-- Object syntax -->
<div :class="{ 'card--featured': isFeatured, active: isActive }"></div>

<!-- Array syntax -->
<div :class="['card', isActive ? 'active' : 'inactive']"></div>

<!-- String -->
<div :class="'card card--featured'"></div>

<!-- v-bind:class -->
<div v-bind:class="{ active: true }"></div>
```

### React (JSX/TSX)

```tsx
// Static
<div className="card card--featured" />

// Dynamic
<div className={`card ${isActive ? 'active' : ''}`} />

// clsx / classNames / cn
<div className={clsx('card', { 'card--featured': featured })} />

// CSS Modules
<div className={styles.card} />
<div className={styles['card--featured']} />
```

### CSS/SCSS

```scss
// Plain CSS
.card {
}
.card.active {
}

// SCSS nesting with BEM
.card {
	&__header {
		&--highlighted {
		}
	}
	&--featured {
	}
}
```

## Installation

### VS Code

Install from the VS Code Marketplace, or package locally:

```bash
npm install
npm run package          # esbuild production bundle
npx @vscode/vsce package  # creates .vsix
code --install-extension css-classes-lsp-*.vsix
```

The extension activates automatically for CSS, SCSS, HTML, Vue, and React files. All settings live under `cssClasses.*` in VS Code settings.

### Neovim

See [neovim/README.md](neovim/README.md) for detailed Neovim 0.11+ setup instructions.

```bash
npm install
npm run build  # tsc build for standalone server
```

```lua
-- ~/.config/nvim/lsp/css_classes.lua
return {
  cmd = { 'node', '/path/to/css-classes/dist/server.js', '--stdio' },
  filetypes = { 'html', 'vue', 'javascriptreact', 'typescriptreact', 'css', 'scss' },
  root_markers = { 'package.json', '.git' },
}
```

```lua
vim.lsp.enable('css_classes')
```

## Configuration

All settings are optional. Pass them via `initializationOptions` or `settings.cssClasses`:

| Setting                  | Type       | Default                       | Description                          |
| ------------------------ | ---------- | ----------------------------- | ------------------------------------ |
| `includePatterns`        | `string[]` | `["**/*.css", "**/*.scss"]`   | Glob patterns for CSS files to index |
| `excludePatterns`        | `string[]` | `["**/node_modules/**", ...]` | Glob patterns to exclude             |
| `languages.html`         | `boolean`  | `true`                        | Enable HTML class parsing            |
| `languages.vue`          | `boolean`  | `true`                        | Enable Vue :class parsing            |
| `languages.react`        | `boolean`  | `true`                        | Enable React className parsing       |
| `extensions.html`        | `string[]` | `[".html", ".htm"]`           | HTML file extensions                 |
| `extensions.vue`         | `string[]` | `[".vue"]`                    | Vue file extensions                  |
| `extensions.react`       | `string[]` | `[".jsx", ".tsx"]`            | React file extensions                |
| `extensions.css`         | `string[]` | `[".css", ".scss"]`           | Stylesheet extensions                |
| `bemEnabled`             | `boolean`  | `true`                        | Enable BEM pattern detection         |
| `bemSeparators.element`  | `string`   | `"__"`                        | BEM element separator                |
| `bemSeparators.modifier` | `string`   | `"--"`                        | BEM modifier separator               |
| `scssNesting`            | `boolean`  | `true`                        | Resolve SCSS `&` nesting             |
| `searchEmbeddedStyles`   | `boolean`  | `true`                        | Index `<style>` blocks               |

## Architecture

```
src/
├── extension.ts           # VS Code extension client (LanguageClient)
├── server.ts              # LSP server entry point (stdio + IPC transport)
├── config.ts              # Configuration resolution
├── types.ts               # Shared type definitions
├── core/
│   ├── css-index.ts       # In-memory class definition index
│   ├── definition.ts      # Go-to-definition logic
│   ├── hover.ts           # Hover provider
│   ├── completion.ts      # Completion provider
│   ├── references.ts      # Find all references provider
│   ├── diagnostics.ts     # Undefined class warnings
│   └── workspace-symbols.ts # Workspace symbol search
├── parsers/
│   ├── css-parser.ts      # CSS/SCSS parser (nesting + BEM)
│   ├── html-parser.ts     # HTML class="" parser
│   ├── vue-parser.ts      # Vue :class parser (object/array/string)
│   └── react-parser.ts    # React className/clsx/CSS Modules parser
├── scanner/
│   └── workspace-scanner.ts  # File discovery with fast-glob
└── utils/
    ├── bem.ts             # BEM parsing utilities
    └── position.ts        # Position/offset conversion utilities
esbuild.mjs                # Bundles extension + server for VS Code
```

## Development

```bash
npm install
npm test            # Run tests
npm run watch       # esbuild watch (VS Code extension)
npm run build:watch # tsc watch (standalone server)
npm run build       # tsc production build (standalone)
npm run package     # esbuild production bundle (VS Code)
```

### Debugging the VS Code Extension

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded. The `.vscode/launch.json` provides two configurations:

- **Run Extension** — launches the extension host with esbuild watch
- **Attach to Server** — attaches to the LSP server on port 6009
- **Extension + Server** — compound launch for both

## License

MIT
