# Neovim Integration

## Requirements

- Neovim >= 0.11.6 (uses `vim.lsp.config` / `vim.lsp.enable`)
- Node.js >= 20

## Installation

### Option 1: Lazy.nvim (recommended)

```lua
-- lazy.nvim plugin spec
{
  'Dani-rev-96/css-classes',
  build = 'npm install && npm run build',
  config = function()
    vim.lsp.enable('css_classes')
  end,
}
```

That's it. The plugin ships `lsp/css_classes.lua` which Neovim auto-discovers. The `build` step compiles the TypeScript server on install/update.

### Option 2: Nix Flake (vimPlugin)

Add the flake input and use the `vimPlugin` output:

```nix
# flake.nix
{
  inputs.css-classes-lsp.url = "github:Dani-rev-96/css-classes";

  # In your Neovim/home-manager config:
  programs.neovim.plugins = [
    css-classes-lsp.packages.${system}.vimPlugin
  ];
}
```

Then in your Neovim config:

```lua
vim.lsp.enable('css_classes')
```

The Nix build pre-compiles the server, so no runtime build step is needed.

### Option 3: Nix Flake (standalone binary)

If you prefer the LSP server as a standalone binary on `$PATH`:

```nix
# Add to your system/home packages:
environment.systemPackages = [
  css-classes-lsp.packages.${system}.default
];
```

Then define a local LSP config:

```lua
-- ~/.config/nvim/lsp/css_classes.lua  (or after/lsp/css_classes.lua to override)
return {
  cmd = { 'css-classes-lsp', '--stdio' },
  filetypes = { 'html', 'vue', 'javascriptreact', 'typescriptreact', 'css', 'scss' },
  root_markers = { 'package.json', '.git' },
}
```

```lua
vim.lsp.enable('css_classes')
```

### Option 4: Manual

```bash
git clone https://github.com/Dani-rev-96/css-classes ~/.local/share/nvim/site/pack/plugins/start/css-classes
cd ~/.local/share/nvim/site/pack/plugins/start/css-classes
npm install && npm run build
```

```lua
-- init.lua
vim.lsp.enable('css_classes')
```

## How It Works

This plugin follows the Neovim 0.11+ convention:

1. **`lsp/css_classes.lua`** — Automatically found by `vim.lsp.config()` when the plugin is on `runtimepath`. It defines `cmd`, `filetypes`, `root_markers`, and default `settings`.
2. **`vim.lsp.enable('css_classes')`** — Activates the config. Neovim will auto-attach the LSP client to matching buffers.
3. **`lua/css-classes/init.lua`** — Optional module with a `build()` helper (used by Lazy's build hook).

No `require('lspconfig')` needed. No setup function to call. Just `vim.lsp.enable('css_classes')`.

## Overriding Settings

You can customize settings using `vim.lsp.config()` or an `after/lsp/css_classes.lua` file. These merge with the defaults from this plugin:

```lua
-- init.lua or after/lsp/css_classes.lua
vim.lsp.config('css_classes', {
  settings = {
    cssClasses = {
      languages = {
        react = false, -- disable React support
      },
      extensions = {
        html = { '.html', '.htm', '.ejs' },
      },
    },
  },
})
```

See `:help lsp-config-merge` for how Neovim merges multiple config sources.

## Using Alongside Other LSP Servers

The css-classes LSP complements framework-specific servers. Neovim 0.11+ handles multiple LSP servers per buffer natively — no special config needed.

- **Vue**: Works alongside Volar — css-classes handles class navigation, Volar handles Vue-specific features.
- **React/TypeScript**: Works alongside ts_ls — css-classes handles class names, ts_ls handles types.
- **HTML**: Works alongside html-ls — css-classes adds class definition jumping.
- **CSS**: Works alongside css-ls — css-classes adds cross-file class navigation from templates.

## Features

All features work out of the box with Neovim 0.11's default keymaps:

| Feature           | Keymap         | LSP Method                        |
| ----------------- | -------------- | --------------------------------- |
| Go to Definition  | `gd` / `<C-]>` | `textDocument/definition`         |
| Hover             | `K`            | `textDocument/hover`              |
| References        | `grr`          | `textDocument/references`         |
| Rename            | `grn`          | `textDocument/rename`             |
| Completion        | `<C-x><C-o>`   | `textDocument/completion`         |
| Workspace Symbols | `gO`           | `workspace/symbol`                |
| Diagnostics       | automatic      | `textDocument/publishDiagnostics` |

### Enable Auto-Completion

To enable LSP-driven auto-completion (triggers on `"`, `'`, space in class contexts):

```lua
vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('css_classes_completion', {}),
  callback = function(args)
    local client = vim.lsp.get_client_by_id(args.data.client_id)
    if client and client.name == 'css_classes' and client:supports_method('textDocument/completion') then
      vim.lsp.completion.enable(true, client.id, args.buf, { autotrigger = true })
    end
  end,
})
```

## Configuration Reference

All settings are optional. Pass via `settings.cssClasses`:

| Setting                  | Type       | Default                                                             | Description                          |
| ------------------------ | ---------- | ------------------------------------------------------------------- | ------------------------------------ |
| `includePatterns`        | `string[]` | `["**/*.css", "**/*.scss"]`                                         | Glob patterns for CSS files to index |
| `excludePatterns`        | `string[]` | `["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"]` | Glob patterns to exclude             |
| `languages.html`         | `boolean`  | `true`                                                              | Enable HTML class parsing            |
| `languages.vue`          | `boolean`  | `true`                                                              | Enable Vue :class parsing            |
| `languages.react`        | `boolean`  | `true`                                                              | Enable React className parsing       |
| `extensions.html`        | `string[]` | `[".html", ".htm"]`                                                 | HTML file extensions                 |
| `extensions.vue`         | `string[]` | `[".vue"]`                                                          | Vue file extensions                  |
| `extensions.react`       | `string[]` | `[".jsx", ".tsx"]`                                                  | React file extensions                |
| `extensions.css`         | `string[]` | `[".css", ".scss"]`                                                 | Stylesheet extensions                |
| `bemEnabled`             | `boolean`  | `true`                                                              | Enable BEM pattern detection         |
| `bemSeparators.element`  | `string`   | `"__"`                                                              | BEM element separator                |
| `bemSeparators.modifier` | `string`   | `"--"`                                                              | BEM modifier separator               |
| `bemDefinitionParts`     | `boolean`  | `true`                                                              | BEM-part-aware go-to-definition      |
| `scssNesting`            | `boolean`  | `true`                                                              | Resolve SCSS `&` nesting             |
| `searchEmbeddedStyles`   | `boolean`  | `true`                                                              | Index `<style>` blocks               |
| `respectGitignore`       | `boolean`  | `true`                                                              | Respect .gitignore when scanning     |

## Troubleshooting

### Check health

```vim
:checkhealth vim.lsp
```

Look for `css_classes` under "Enabled Configurations".

### View LSP logs

```lua
vim.lsp.set_log_level('debug')
-- then trigger the issue, then:
vim.cmd('edit ' .. vim.lsp.get_log_path())
```

### Server doesn't start

1. Verify Node.js >= 20 is available: `:!node --version`
2. Verify `dist/server.js` exists in the plugin directory
3. If installed via Lazy, try `:Lazy build css-classes-lsp`

### Classes not being indexed

1. Check `includePatterns` matches your CSS/SCSS files
2. Check `excludePatterns` isn't excluding too much
3. Verify the workspace root is correct (check `:checkhealth vim.lsp`)

### No completions / definitions

1. Wait for initial indexing (check LSP logs for "Indexed X classes")
2. Ensure the filetype is correct: `:set filetype?`
3. For Vue files, ensure `searchEmbeddedStyles` is enabled
