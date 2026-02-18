import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { parseSourceMap, resolveOriginalPosition, findSourceMap } from "../src/utils/sourcemap.js";

describe("Source Map Support", () => {
  describe("parseSourceMap", () => {
    it("parses a valid V3 source map", () => {
      const mapJson = JSON.stringify({
        version: 3,
        file: "output.css",
        sources: ["input.js"],
        sourcesContent: ["const x = 1;"],
        mappings: "AAAA",
      });

      const result = parseSourceMap(mapJson);
      expect(result).not.toBeNull();
      expect(result!.version).toBe(3);
      expect(result!.sources).toEqual(["input.js"]);
      expect(result!.file).toBe("output.css");
    });

    it("returns null for invalid JSON", () => {
      const result = parseSourceMap("not valid json");
      expect(result).toBeNull();
    });

    it("returns null for non-V3 source maps", () => {
      const result = parseSourceMap(JSON.stringify({ version: 2, mappings: "" }));
      expect(result).toBeNull();
    });

    it("handles missing optional fields", () => {
      const mapJson = JSON.stringify({
        version: 3,
        sources: [],
        mappings: "",
      });

      const result = parseSourceMap(mapJson);
      expect(result).not.toBeNull();
      expect(result!.file).toBeUndefined();
      expect(result!.sourceRoot).toBeUndefined();
    });
  });

  describe("resolveOriginalPosition", () => {
    it("resolves a simple single-segment mapping", () => {
      // AAAA = generatedCol:0, sourceIdx:0, origLine:0, origCol:0
      const map = {
        version: 3,
        sources: ["../src/component.jsx"],
        mappings: "AAAA",
      };

      const result = resolveOriginalPosition(map, 0, 0, "/project/dist/output.css.map");
      expect(result).not.toBeNull();
      expect(result!.originalFilePath).toBe("/project/src/component.jsx");
      expect(result!.originalLine).toBe(0);
      expect(result!.originalColumn).toBe(0);
    });

    it("resolves with sourceRoot", () => {
      const map = {
        version: 3,
        sourceRoot: "../src",
        sources: ["component.jsx"],
        mappings: "AAAA",
      };

      const result = resolveOriginalPosition(map, 0, 0, "/project/dist/output.css.map");
      expect(result).not.toBeNull();
      expect(result!.originalFilePath).toBe("/project/src/component.jsx");
    });

    it("returns null for out-of-range line", () => {
      const map = {
        version: 3,
        sources: ["input.js"],
        mappings: "AAAA",
      };

      const result = resolveOriginalPosition(map, 999, 0, "/project/output.css.map");
      expect(result).toBeNull();
    });

    it("resolves multi-line mappings", () => {
      // AAAA = line 0: genCol:0, src:0, origLine:0, origCol:0
      // AACA = line 1: genCol:0, src:0, origLine:1, origCol:0
      const map = {
        version: 3,
        sources: ["input.js"],
        mappings: "AAAA;AACA",
      };

      const result = resolveOriginalPosition(map, 1, 0, "/project/output.css.map");
      expect(result).not.toBeNull();
      expect(result!.originalLine).toBe(1);
    });

    it("selects the closest segment for a column", () => {
      // AAAA,KACQ = two segments on line 0
      // Segment 1: genCol:0, src:0, origLine:0, origCol:0
      // Segment 2: genCol:5, src:0, origLine:1, origCol:8
      const map = {
        version: 3,
        sources: ["input.js"],
        mappings: "AAAA,KACQ",
      };

      // Column 3 should map to segment 1 (closest preceding)
      const result1 = resolveOriginalPosition(map, 0, 3, "/project/output.css.map");
      expect(result1).not.toBeNull();
      expect(result1!.originalLine).toBe(0);
      expect(result1!.originalColumn).toBe(0);

      // Column 6 should map to segment 2
      const result2 = resolveOriginalPosition(map, 0, 6, "/project/output.css.map");
      expect(result2).not.toBeNull();
      expect(result2!.originalLine).toBe(1);
      expect(result2!.originalColumn).toBe(8);
    });

    it("handles empty line mappings", () => {
      // Two semicolons = two empty generated lines before any segments
      const map = {
        version: 3,
        sources: ["input.js"],
        mappings: ";;AAAA",
      };

      // Line 2 should have a mapping
      const result = resolveOriginalPosition(map, 2, 0, "/project/output.css.map");
      expect(result).not.toBeNull();
      expect(result!.originalLine).toBe(0);

      // Line 0 should have no segments
      const resultEmpty = resolveOriginalPosition(map, 0, 0, "/project/output.css.map");
      expect(resultEmpty).toBeNull();
    });
  });

  describe("findSourceMap", () => {
    it("detects inline base64 source map", async () => {
      const sourceMap = {
        version: 3,
        sources: ["input.js"],
        mappings: "AAAA",
      };
      const base64 = Buffer.from(JSON.stringify(sourceMap)).toString("base64");
      const css = `.foo { color: red; }\n/*# sourceMappingURL=data:application/json;base64,${base64} */`;

      const result = await findSourceMap("/test.css", css);
      expect(result).not.toBeNull();
      expect(result!.map.version).toBe(3);
      expect(result!.map.sources).toEqual(["input.js"]);
    });

    it("returns null when no source map is present", async () => {
      const css = `.foo { color: red; }`;
      const result = await findSourceMap("/test.css", css);
      expect(result).toBeNull();
    });

    it("returns null for non-existent external map file", async () => {
      const css = `.foo { color: red; }\n/*# sourceMappingURL=nonexistent.css.map */`;
      const result = await findSourceMap("/tmp/test.css", css);
      expect(result).toBeNull();
    });

    it("detects sourceMappingURL with @ prefix", async () => {
      const sourceMap = {
        version: 3,
        sources: ["input.js"],
        mappings: "AAAA",
      };
      const base64 = Buffer.from(JSON.stringify(sourceMap)).toString("base64");
      const css = `.foo { color: red; }\n/*@ sourceMappingURL=data:application/json;base64,${base64} */`;

      const result = await findSourceMap("/test.css", css);
      expect(result).not.toBeNull();
    });
  });

  describe("VLQ decoding", () => {
    it("handles complex multi-segment mappings without error", () => {
      // Real-world-like mapping string
      const map = {
        version: 3,
        sources: ["styles.module.css"],
        mappings: "AAAA;AACA,eAAe;AACf",
      };

      // Should not throw
      const result = resolveOriginalPosition(map, 1, 0, "/project/dist/output.css.map");
      expect(result).not.toBeNull();
      expect(result!.originalLine).toBe(1);
    });
  });
});
