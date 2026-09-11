--- css-classes-lsp Neovim plugin
--- This plugin provides an LSP config for css-classes-lsp that is automatically
--- discovered by Neovim 0.11+ via `vim.lsp.config()`.
---
--- Usage:
---   1. Install this plugin (Lazy, Nix, or manual)
---   2. Run: vim.lsp.enable('css_classes')
---
--- The LSP config is defined in lsp/css_classes.lua and requires Node.js >= 20.
--- The bundled server lives at dist/server.js within the plugin directory.

local M = {}

--- Build the server if dist/server.js doesn't exist.
--- Useful for Lazy's build hook.
function M.build()
  local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h')
  local server_js = plugin_root .. '/dist/server.js'
  if vim.fn.filereadable(server_js) == 0 then
    vim.notify('[css-classes-lsp] Building server...', vim.log.levels.INFO)
    local result = vim.system({ 'npm', 'install', '--production=false' }, { cwd = plugin_root }):wait()
    if result.code ~= 0 then
      vim.notify('[css-classes-lsp] npm install failed:\n' .. (result.stderr or ''), vim.log.levels.ERROR)
      return
    end
    result = vim.system({ 'npm', 'run', 'build' }, { cwd = plugin_root }):wait()
    if result.code ~= 0 then
      vim.notify('[css-classes-lsp] npm run build failed:\n' .. (result.stderr or ''), vim.log.levels.ERROR)
      return
    end
    vim.notify('[css-classes-lsp] Build complete.', vim.log.levels.INFO)
  end
end

return M
