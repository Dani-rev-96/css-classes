import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { extractImports, resolveImportPath } from "../src/core/import-resolver.js";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");

describe("Import Resolver", () => {
  describe("extractImports", () => {
    it("extracts @import with double quotes", () => {
      const content = `@import "variables";\n.foo { color: red; }`;
      const imports = extractImports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toEqual({
        specifier: "variables",
        line: 0,
        type: "import",
      });
    });

    it("extracts @import with single quotes", () => {
      const content = `@import 'reset';`;
      const imports = extractImports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].specifier).toBe("reset");
    });

    it("extracts @import url()", () => {
      const content = `@import url("https://fonts.googleapis.com/css2");`;
      const imports = extractImports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0].specifier).toBe("https://fonts.googleapis.com/css2");
      expect(imports[0].type).toBe("import");
    });

    it("extracts @use statements", () => {
      const content = `@use 'variables';\n@use 'mixins' as m;`;
      const imports = extractImports(content);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toEqual({ specifier: "variables", line: 0, type: "use" });
      expect(imports[1]).toEqual({ specifier: "mixins", line: 1, type: "use" });
    });

    it("extracts @forward statements", () => {
      const content = `@forward 'typography';`;
      const imports = extractImports(content);

      expect(imports).toHaveLength(1);
      expect(imports[0]).toEqual({ specifier: "typography", line: 0, type: "forward" });
    });

    it("extracts mixed imports", () => {
      const content = [
        `@use 'variables';`,
        `@use 'mixins' as m;`,
        `@forward 'typography';`,
        ``,
        `.foo { color: red; }`,
      ].join("\n");

      const imports = extractImports(content);
      expect(imports).toHaveLength(3);
      expect(imports.map((i) => i.type)).toEqual(["use", "use", "forward"]);
    });

    it("returns empty array for no imports", () => {
      const content = `.foo { color: red; }`;
      const imports = extractImports(content);
      expect(imports).toHaveLength(0);
    });
  });

  describe("resolveImportPath", () => {
    it("resolves SCSS partial with underscore prefix", async () => {
      const fromFile = path.join(fixturesDir, "main.scss");
      const resolved = await resolveImportPath("variables", fromFile);

      expect(resolved).toBe(path.join(fixturesDir, "_variables.scss"));
    });

    it("resolves @forward reference", async () => {
      const fromFile = path.join(fixturesDir, "main.scss");
      const resolved = await resolveImportPath("typography", fromFile);

      expect(resolved).toBe(path.join(fixturesDir, "_typography.scss"));
    });

    it("resolves @use reference", async () => {
      const fromFile = path.join(fixturesDir, "main.scss");
      const resolved = await resolveImportPath("mixins", fromFile);

      expect(resolved).toBe(path.join(fixturesDir, "_mixins.scss"));
    });

    it("resolves exact file path with extension", async () => {
      const fromFile = path.join(fixturesDir, "main.scss");
      const resolved = await resolveImportPath("styles.css", fromFile);

      expect(resolved).toBe(path.join(fixturesDir, "styles.css"));
    });

    it("returns null for HTTP URLs", async () => {
      const fromFile = path.join(fixturesDir, "main.scss");
      const resolved = await resolveImportPath("https://example.com/style.css", fromFile);

      expect(resolved).toBeNull();
    });

    it("returns null for unresolvable specifiers", async () => {
      const fromFile = path.join(fixturesDir, "main.scss");
      const resolved = await resolveImportPath("nonexistent-file", fromFile);

      expect(resolved).toBeNull();
    });
  });
});
