# Neovim Integration

## Requirements

- Neovim >= 0.11.6
- Node.js >= 20

## Installation

### 1. Build the server

```bash
cd /path/to/css-classes
npm install
npm run build
```

### 2. Configure in Neovim

Since Neovim 0.11, you can configure LSP clients natively using `vim.lsp.config` and `vim.lsp.enable`.

Add to your Neovim config (e.g. `~/.config/nvim/lsp/css_classes.lua`):

```lua
-- ~/.config/nvim/lsp/css_classes.lua
return {
  cmd = { 'node', '/path/to/css-classes/dist/server.js', '--stdio' },
  filetypes = { 'html', 'vue', 'javascriptreact', 'typescriptreact', 'css', 'scss' },
  root_markers = { 'package.json', '.git' },
  settings = {
    cssClasses = {
      -- All settings are optional, these are the defaults:
      includePatterns = { '**/*.css', '**/*.scss' },
      excludePatterns = { '**/node_modules/**', '**/dist/**', '**/build/**' },
      languages = {
        html = true,
        vue = true,
        react = true,
      },
      bemEnabled = true,
      bemSeparators = {
        element = '__',
        modifier = '--',
      },
      scssNesting = true,
      searchEmbeddedStyles = true,
    },
  },
}
```

Then enable it:

```lua
-- ~/.config/nvim/init.lua (or wherever you configure LSP)
vim.lsp.enable('css_classes')
```

### 3. Using alongside other LSP servers

The css-classes LSP is designed to complement framework-specific LSP servers:

- **Vue**: Works alongside `vue-language-server` (Volar) — css-classes provides class navigation, Volar handles Vue-specific features.
- **React/TypeScript**: Works alongside `typescript-language-server` — css-classes handles class names, tsserver handles types.
- **HTML**: Works alongside `html-languageserver` — css-classes adds class definition jumping.
- **CSS**: Works alongside `css-languageserver` — css-classes adds cross-file class navigation from templates.

Neovim 0.11+ handles multiple LSP servers per buffer natively. No special configuration needed.

## Features

### Go to Definition

Place your cursor on any CSS class name and use:

- `gd` (default LSP mapping) — jump to the CSS/SCSS definition
- If multiple definitions exist, a picker will be shown

### Hover

Hover over a class name to see:

- Number of definitions
- File locations
- BEM parts breakdown (if applicable)

### Completion

In any class context (`class="`, `className=`, `:class=`, `clsx()`, etc.), completion will suggest all indexed class names from your project's CSS/SCSS files.

## Disabling specific languages

If you only work with Vue and don't need React support:

```lua
settings = {
  cssClasses = {
    languages = {
      html = true,
      vue = true,
      react = false,
    },
  },
},
```

## Custom file extensions

If your project uses non-standard extensions:

```lua
settings = {
  cssClasses = {
    extensions = {
      html = { '.html', '.htm', '.ejs' },
      vue = { '.vue' },
      react = { '.jsx', '.tsx' },
      css = { '.css', '.scss', '.less' },
    },
  },
},
```

## Troubleshooting

### Server doesn't start

1. Verify the path to `dist/server.js` is correct
2. Ensure you've run `npm run build` after install
3. Check Neovim LSP logs: `:lua vim.cmd('edit ' .. vim.lsp.get_log_path())`

### Classes not being indexed

1. Check your `includePatterns` — make sure they match your CSS/SCSS files
2. Check `excludePatterns` isn't excluding too much
3. Verify the workspace root is correct (the project root with your CSS files)

### No completions / definitions

1. Wait for initial indexing to complete (check LSP logs for "Indexed X classes")
2. Ensure the file type is in your configured `filetypes`
3. For Vue files, ensure `searchEmbeddedStyles` is enabled if you have `<style>` blocks
