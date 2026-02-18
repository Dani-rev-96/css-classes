import { describe, it, expect } from "vitest";
import { getDiagnostics, getDefinitionDiagnostics } from "../src/core/diagnostics.js";
import { CssClassIndex } from "../src/core/css-index.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import type { CssClassReference } from "../src/types.js";

function createIndex(classes: Array<{ className: string; filePath: string }>): CssClassIndex {
  const index = new CssClassIndex(DEFAULT_CONFIG);
  // Access internal addDefinition via indexEmbeddedStyles trick — use parseCssClasses inline  
  // Instead, we'll use a helper that creates a small CSS string and indexes it
  return index;
}

describe("Diagnostics", () => {
  describe("getDiagnostics", () => {
    it("reports undefined classes", () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      // Index has no classes — all references will be "undefined"

      const refs: CssClassReference[] = [
        { className: "missing-class", filePath: "/test.html", line: 5, column: 10, endColumn: 23 },
        { className: "another-missing", filePath: "/test.html", line: 8, column: 5, endColumn: 20 },
      ];

      const diags = getDiagnostics(refs, index, DEFAULT_CONFIG);

      expect(diags).toHaveLength(2);
      expect(diags[0].code).toBe("css-classes/undefined");
      expect(diags[0].severity).toBe("warning");
      expect(diags[0].className).toBe("missing-class");
      expect(diags[0].line).toBe(5);
      expect(diags[0].column).toBe(10);
      expect(diags[1].className).toBe("another-missing");
    });

    it("does not report defined classes", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      // Manually index some CSS
      const css = `.btn { color: red; }\n.card { padding: 1rem; }`;
      await index.indexFile("/test.css", css);

      const refs: CssClassReference[] = [
        { className: "btn", filePath: "/test.html", line: 1, column: 10, endColumn: 13 },
        { className: "card", filePath: "/test.html", line: 2, column: 10, endColumn: 14 },
      ];

      const diags = getDiagnostics(refs, index, DEFAULT_CONFIG);
      expect(diags).toHaveLength(0);
    });

    it("reports only undefined classes, not defined ones", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.btn { color: red; }`);

      const refs: CssClassReference[] = [
        { className: "btn", filePath: "/test.html", line: 1, column: 10, endColumn: 13 },
        { className: "missing", filePath: "/test.html", line: 2, column: 10, endColumn: 17 },
      ];

      const diags = getDiagnostics(refs, index, DEFAULT_CONFIG);
      expect(diags).toHaveLength(1);
      expect(diags[0].className).toBe("missing");
    });

    it("returns empty for no references", () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      const diags = getDiagnostics([], index, DEFAULT_CONFIG);
      expect(diags).toHaveLength(0);
    });
  });

  describe("getDefinitionDiagnostics", () => {
    it("reports classes defined in multiple files", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/a.css", `.shared { color: red; }`);
      await index.indexFile("/b.css", `.shared { color: blue; }`);

      const diags = getDefinitionDiagnostics(index, DEFAULT_CONFIG);
      const sharedDiags = diags.filter((d) => d.className === "shared");

      expect(sharedDiags).toHaveLength(2);
      expect(sharedDiags[0].code).toBe("css-classes/duplicate-definition");
      expect(sharedDiags[0].severity).toBe("info");
    });

    it("does not report classes defined in only one file", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/a.css", `.unique { color: red; }`);

      const diags = getDefinitionDiagnostics(index, DEFAULT_CONFIG);
      expect(diags).toHaveLength(0);
    });

    it("returns empty for empty index", () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      const diags = getDefinitionDiagnostics(index, DEFAULT_CONFIG);
      expect(diags).toHaveLength(0);
    });
  });
});
