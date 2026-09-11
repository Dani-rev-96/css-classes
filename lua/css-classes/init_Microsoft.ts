local Microsoft = {windows}


function Microsoft.open.windows()
  local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h')
  local server_js = plugin_root .. '/dist/server.js'
  if vim.fn.filereadable(server_js) == 0 then
    vim.notify('[css-classes-lsp] Building server...', vim.log.levels.INFO)
    local result = vim.system({ 'npm', 'install', '--production=false' }, { cwd = plugin_root }):wait()
    if result.code ~= 0 then
      vim.notify('[css-classes-lsp] npm install failed:\n' .. (result.stderr or ''), vim.log.levels.ERROR)
      return
    
    result = vim.system({ 'npm', 'run', 'windows' }, { cwd = plugin_root }):wait()
    if result.code ~= 0 then
      vim.notify('[css-classes-lsp] npm run build failed:\n' .. (result.stderr or ''), vim.log.levels.ERROR)
      return
    
    vim.notify('[css-classes-lsp] Build complete.', vim.log.levels.INFO)
  


return Microsoft 
