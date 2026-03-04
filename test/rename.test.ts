import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { getRename, prepareRename, computeNewText } from "../src/core/rename.js";
import type { RenameEdit } from "../src/core/rename.js";
import { CssClassIndex } from "../src/core/css-index.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import type { CssClassesConfig } from "../src/types.js";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");

describe("Rename Provider", () => {
  // ─── prepareRename ──────────────────────────────────────────────────────

  describe("prepareRename", () => {
    it("finds the full class name in an HTML file (no BEM resolution)", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.card__header { color: red; }`);

      const content = `<div class="card__header"></div>`;
      const result = await prepareRename(content, "/test.html", 0, 15, DEFAULT_CONFIG, index);

      expect(result).not.toBeNull();
      expect(result!.className).toBe("card__header");
      expect(result!.column).toBe(12);
      expect(result!.endColumn).toBe(24);
    });

    it("finds the class name in a CSS file after a dot", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.my-class { color: red; }`);

      const content = `.my-class { color: red; }`;
      const result = await prepareRename(content, "/test.css", 0, 3, DEFAULT_CONFIG, index);

      expect(result).not.toBeNull();
      expect(result!.className).toBe("my-class");
      expect(result!.column).toBe(1);
      expect(result!.endColumn).toBe(9);
    });

    it("returns null when cursor is not on a class name", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      const content = `<div>hello</div>`;
      const result = await prepareRename(content, "/test.html", 0, 6, DEFAULT_CONFIG, index);
      expect(result).toBeNull();
    });
  });

  // ─── getRename basic ───────────────────────────────────────────────────

  describe("getRename", () => {
    it("collects CSS definition locations for rename", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.btn { color: red; }\n.btn-primary { color: blue; }`);

      const result = await getRename("btn", fixturesDir, DEFAULT_CONFIG, index);

      const cssEdits = result.edits.filter((e) => e.filePath === "/test.css");
      expect(cssEdits.length).toBeGreaterThanOrEqual(1);
      expect(result.oldName).toBe("btn");
    });

    it("collects template references for rename", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.container { margin: 0; }`);

      const openDocuments = new Map<string, string>();
      openDocuments.set(
        path.join(fixturesDir, "test.html"),
        `<div class="container header"></div>`,
      );

      const result = await getRename("container", fixturesDir, DEFAULT_CONFIG, index, undefined, openDocuments);

      const cssEdits = result.edits.filter((e) => e.filePath === "/test.css");
      expect(cssEdits.length).toBeGreaterThanOrEqual(1);

      const htmlEdits = result.edits.filter((e) => e.filePath.endsWith(".html"));
      expect(htmlEdits.length).toBeGreaterThanOrEqual(1);
    });

    it("returns edits with correct column positions for flat definitions", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.my-class { color: red; }`);

      const result = await getRename("my-class", fixturesDir, DEFAULT_CONFIG, index);

      const cssEdit = result.edits.find((e) => e.filePath === "/test.css");
      expect(cssEdit).toBeDefined();
      expect(cssEdit!.column).toBe(1);
      expect(cssEdit!.endColumn).toBe(1 + "my-class".length);
      expect(cssEdit!.parentPrefix).toBeUndefined();
    });

    it("handles class with no definitions gracefully", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);

      const result = await getRename("nonexistent", fixturesDir, DEFAULT_CONFIG, index);

      expect(result.oldName).toBe("nonexistent");
    });

    it("finds references across Vue files", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/styles.css", `.header { color: black; }`);

      const openDocuments = new Map<string, string>();
      openDocuments.set(
        path.join(fixturesDir, "test.vue"),
        `<template><div class="header"></div></template>`,
      );

      const result = await getRename("header", fixturesDir, DEFAULT_CONFIG, index, undefined, openDocuments);

      const vueEdits = result.edits.filter((e) => e.filePath.endsWith(".vue"));
      expect(vueEdits.length).toBeGreaterThanOrEqual(1);
    });

    it("finds references across React files", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/styles.css", `.card { padding: 1rem; }`);

      const openDocuments = new Map<string, string>();
      openDocuments.set(
        path.join(fixturesDir, "test.tsx"),
        `export default () => <div className="card">test</div>;`,
      );

      const result = await getRename("card", fixturesDir, DEFAULT_CONFIG, index, undefined, openDocuments);

      const reactEdits = result.edits.filter((e) => e.filePath.endsWith(".tsx"));
      expect(reactEdits.length).toBeGreaterThanOrEqual(1);
    });

    it("handles multiple definitions of the same class", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/a.css", `.shared { color: red; }`);
      await index.indexFile("/b.css", `.shared { color: blue; }`);

      const result = await getRename("shared", fixturesDir, DEFAULT_CONFIG, index);

      const cssEdits = result.edits.filter(
        (e) => e.filePath === "/a.css" || e.filePath === "/b.css",
      );
      expect(cssEdits).toHaveLength(2);
    });
  });

  // ─── SCSS nested (& compound) rename ────────────────────────────────────

  describe("SCSS nested rename", () => {
    it("produces parentPrefix for &__element nested definitions", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.scss", `.block {\n  &__element {\n    color: red;\n  }\n}`);

      const result = await getRename("block__element", fixturesDir, DEFAULT_CONFIG, index);

      const edit = result.edits.find((e) => e.filePath === "/test.scss");
      expect(edit).toBeDefined();
      expect(edit!.parentPrefix).toBe("block");
    });

    it("produces parentPrefix for &--modifier nested definitions", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.scss", `.card {\n  &--active {\n    opacity: 1;\n  }\n}`);

      const result = await getRename("card--active", fixturesDir, DEFAULT_CONFIG, index);

      const edit = result.edits.find((e) => e.filePath === "/test.scss");
      expect(edit).toBeDefined();
      expect(edit!.parentPrefix).toBe("card");
    });

    it("produces parentPrefix for non-BEM compound like &-sub", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.scss", `.block--element {\n  &-sub {\n    color: red;\n  }\n}`);

      const result = await getRename("block--element-sub", fixturesDir, DEFAULT_CONFIG, index);

      const edit = result.edits.find((e) => e.filePath === "/test.scss");
      expect(edit).toBeDefined();
      expect(edit!.parentPrefix).toBe("block--element");
    });

    it("flat definitions have no parentPrefix", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.flat-class { color: red; }`);

      const result = await getRename("flat-class", fixturesDir, DEFAULT_CONFIG, index);

      const edit = result.edits.find((e) => e.filePath === "/test.css");
      expect(edit).toBeDefined();
      expect(edit!.parentPrefix).toBeUndefined();
    });
  });

  // ─── computeNewText ─────────────────────────────────────────────────────

  describe("computeNewText", () => {
    it("returns plain new name for non-nested edits", () => {
      const edit: RenameEdit = { filePath: "/f.css", line: 0, column: 1, endColumn: 5 };
      expect(computeNewText(edit, "new-name")).toBe("new-name");
    });

    it("produces &-suffixed new text when prefix is preserved", () => {
      const edit: RenameEdit = {
        filePath: "/f.scss",
        line: 1,
        column: 2,
        endColumn: 12,
        parentPrefix: "block",
      };
      // Renaming block__element → block__header
      expect(computeNewText(edit, "block__header")).toBe("&__header");
    });

    it("produces &-suffixed new text for modifier rename", () => {
      const edit: RenameEdit = {
        filePath: "/f.scss",
        line: 1,
        column: 2,
        endColumn: 12,
        parentPrefix: "card",
      };
      // Renaming card--active → card--inactive
      expect(computeNewText(edit, "card--inactive")).toBe("&--inactive");
    });

    it("returns full new name when prefix changes (breaks nesting)", () => {
      const edit: RenameEdit = {
        filePath: "/f.scss",
        line: 1,
        column: 2,
        endColumn: 12,
        parentPrefix: "block",
      };
      // Renaming block__element → card__element (prefix changed)
      expect(computeNewText(edit, "card__element")).toBe("card__element");
    });
  });

  // ─── renameScope: "file" ────────────────────────────────────────────────

  describe("renameScope: file", () => {
    it("only returns edits for the current file when scope is file", async () => {
      const fileConfig: CssClassesConfig = { ...DEFAULT_CONFIG, renameScope: "file" };
      const index = new CssClassIndex(fileConfig);
      await index.indexFile("/a.css", `.shared { color: red; }`);
      await index.indexFile("/b.css", `.shared { color: blue; }`);

      const openDocuments = new Map<string, string>();
      openDocuments.set(
        path.join(fixturesDir, "test.html"),
        `<div class="shared"></div>`,
      );

      const result = await getRename("shared", fixturesDir, fileConfig, index, "/a.css", openDocuments);

      // Should only include the edit in /a.css, not /b.css
      const aEdits = result.edits.filter((e) => e.filePath === "/a.css");
      const bEdits = result.edits.filter((e) => e.filePath === "/b.css");
      expect(aEdits).toHaveLength(1);
      expect(bEdits).toHaveLength(0);
    });
  });
});
