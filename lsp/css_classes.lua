--- LSP configuration for css-classes-lsp
--- Automatically discovered by vim.lsp.config() when this plugin is on 'runtimepath'.
--- @see :help lsp-config

-- Resolve the server.js path relative to this plugin's installation directory.
-- Works whether installed via Lazy, Nix, or a manual clone.
local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h')
local server_js = plugin_root .. '/dist/server.js'

return {
  cmd = { 'node', server_js, '--stdio' },
  filetypes = { 'html', 'vue', 'javascriptreact', 'typescriptreact', 'css', 'scss' },
  root_markers = { 'package.json', '.git' },
  settings = {
    cssClasses = {
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
