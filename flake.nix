{
  description = "css-classes-lsp — Language Server for CSS class name navigation";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    {
      # Top-level overlay for easy integration into NixOS / home-manager configs
      overlays.default = final: prev: {
        vimPlugins = prev.vimPlugins // {
          css-classes-nvim = self.packages.${prev.system}.vimPlugin;
        };
        css-classes-lsp = self.packages.${prev.system}.default;
      };
    }
    // flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # The standalone LSP server binary (node wrapper)
        css-classes-lsp = pkgs.buildNpmPackage {
          pname = "css-classes-lsp";
          version = "0.1.0";
          src = self;
          npmDeps = pkgs.importNpmLock {
            npmRoot = self;
          };
          npmConfigHook = pkgs.importNpmLock.npmConfigHook;
          nodejs = pkgs.nodejs_22;

          # Skip native module install scripts (keytar from @vscode/vsce is optional
          # and not used — esbuild bundles everything from pure JS/TS sources)
          npmFlags = [ "--ignore-scripts" ];

          buildPhase = ''
            npm run build
          '';

          installPhase = ''
            mkdir -p $out/bin $out/lib/css-classes-lsp
            cp -r dist $out/lib/css-classes-lsp/
            cp package.json $out/lib/css-classes-lsp/

            # Create a wrapper script that invokes node with the server
            cat > $out/bin/css-classes-lsp <<EOF
            #!/usr/bin/env bash
            exec ${pkgs.nodejs_22}/bin/node $out/lib/css-classes-lsp/dist/server.js "\$@"
            EOF
            chmod +x $out/bin/css-classes-lsp
          '';

          meta = with pkgs.lib; {
            description = "Language Server for CSS class name navigation";
            license = licenses.mit;
            mainProgram = "css-classes-lsp";
          };
        };

        # Neovim plugin (Lua files + pre-built server)
        # First build with npm, then wrap as a Vim plugin
        serverDist = pkgs.buildNpmPackage {
          pname = "css-classes-dist";
          version = "0.1.0";
          src = self;
          npmDeps = pkgs.importNpmLock {
            npmRoot = self;
          };
          npmConfigHook = pkgs.importNpmLock.npmConfigHook;
          nodejs = pkgs.nodejs_22;
          npmFlags = [ "--ignore-scripts" ];

          buildPhase = ''
            npm run build
          '';

          installPhase = ''
            mkdir -p $out
            cp -r dist $out/
          '';
        };

        vimPlugin = pkgs.vimUtils.buildVimPlugin {
          pname = "css-classes-nvim";
          version = "0.1.0";
          src = self;

          # No build needed — copy pre-built dist from serverDist
          buildPhase = ''
            cp -r ${serverDist}/dist .
          '';

          # Only include what Neovim needs
          installPhase = ''
            mkdir -p $out
            cp -r lsp $out/
            cp -r lua $out/
            cp -r dist $out/
          '';

          meta = with pkgs.lib; {
            description = "Neovim plugin for css-classes-lsp";
            license = licenses.mit;
          };
        };
      in
      {
        packages = {
          default = css-classes-lsp;
          inherit css-classes-lsp vimPlugin;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_22
            nodePackages.npm
          ];
        };
      }
    );
}
