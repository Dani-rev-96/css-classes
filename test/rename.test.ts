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
    it("finds the full class name in an HTML file when cursor is on full class", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.simple { color: red; }`);

      const content = `<div class="simple"></div>`;
      // cursor on "simple" at col 14
      const result = await prepareRename(content, "/test.html", 0, 14, DEFAULT_CONFIG, index);

      expect(result).not.toBeNull();
      expect(result!.className).toBe("simple");
      expect(result!.column).toBe(12);
      expect(result!.endColumn).toBe(18);
    });

    it("resolves BEM block when cursor is on block portion of block__element", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.card__header { color: red; }`);

      const content = `<div class="card__header"></div>`;
      // cursor at col 14 → on "card" part (cols 12-15 = "card")
      const result = await prepareRename(content, "/test.html", 0, 14, DEFAULT_CONFIG, index);

      expect(result).not.toBeNull();
      expect(result!.className).toBe("card");
      expect(result!.column).toBe(12);
      expect(result!.endColumn).toBe(16); // "card" is 4 chars
    });

    it("resolves BEM element when cursor is on element portion", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.card__header { color: red; }`);

      const content = `<div class="card__header"></div>`;
      // cursor at col 20 → on "header" part (cols 18-23)
      const result = await prepareRename(content, "/test.html", 0, 20, DEFAULT_CONFIG, index);

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

  // ─── BEM cascade rename ─────────────────────────────────────────────────

  describe("BEM cascade rename", () => {
    it("renaming a block cascades to block__element and block--modifier definitions", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", [
        `.overlay { display: block; }`,
        `.overlay__spacer { margin: 1rem; }`,
        `.overlay__other { padding: 0; }`,
        `.overlay--active { opacity: 1; }`,
      ].join("\n"));

      const result = await getRename("overlay", fixturesDir, DEFAULT_CONFIG, index);

      const classNames = result.edits.map((e) => e.originalClassName).sort();
      expect(classNames).toContain("overlay");
      expect(classNames).toContain("overlay__spacer");
      expect(classNames).toContain("overlay__other");
      expect(classNames).toContain("overlay--active");
    });

    it("renaming a block cascades to template references of BEM children", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.overlay { }\n.overlay__spacer { }`);

      const openDocuments = new Map<string, string>();
      openDocuments.set(
        path.join(fixturesDir, "test.html"),
        `<div class="overlay overlay__spacer"></div>`,
      );

      const result = await getRename("overlay", fixturesDir, DEFAULT_CONFIG, index, undefined, openDocuments);

      const htmlEdits = result.edits.filter((e) => e.filePath.endsWith(".html"));
      const htmlClasses = htmlEdits.map((e) => e.originalClassName).sort();
      expect(htmlClasses).toContain("overlay");
      expect(htmlClasses).toContain("overlay__spacer");
    });

    it("renaming an element cascades to element--modifier", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", [
        `.card__header { }`,
        `.card__header--active { }`,
        `.card__header--disabled { }`,
        `.card__body { }`,
      ].join("\n"));

      const result = await getRename("card__header", fixturesDir, DEFAULT_CONFIG, index);

      const classNames = result.edits.map((e) => e.originalClassName).sort();
      expect(classNames).toContain("card__header");
      expect(classNames).toContain("card__header--active");
      expect(classNames).toContain("card__header--disabled");
      // card__body should NOT be included
      expect(classNames).not.toContain("card__body");
    });

    it("renaming a full BEM class (with modifier) does not cascade", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.card__header { }\n.card__header--active { }`);

      const result = await getRename("card__header--active", fixturesDir, DEFAULT_CONFIG, index);

      const classNames = result.edits.map((e) => e.originalClassName);
      expect(classNames).toEqual(["card__header--active"]);
    });

    it("BEM cascade works for Vue SFC template refs", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.css", `.nav { }\n.nav__item { }\n.nav__item--selected { }`);

      const openDocuments = new Map<string, string>();
      openDocuments.set(
        path.join(fixturesDir, "test.vue"),
        `<template><div class="nav"><span class="nav__item nav__item--selected"></span></div></template>`,
      );

      const result = await getRename("nav", fixturesDir, DEFAULT_CONFIG, index, undefined, openDocuments);

      const vueEdits = result.edits.filter((e) => e.filePath.endsWith(".vue"));
      const vueClasses = vueEdits.map((e) => e.originalClassName).sort();
      expect(vueClasses).toContain("nav");
      expect(vueClasses).toContain("nav__item");
      expect(vueClasses).toContain("nav__item--selected");
    });
  });

  // ─── SCSS nested (& compound) rename ────────────────────────────────────

  describe("SCSS nested rename", () => {
    it("produces parentPrefix for &__element nested definitions", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.scss", `.block {\n  &__element {\n    color: red;\n  }\n}`);

      const result = await getRename("block__element", fixturesDir, DEFAULT_CONFIG, index);

      const edit = result.edits.find((e) => e.filePath === "/test.scss" && e.parentPrefix);
      expect(edit).toBeDefined();
      expect(edit!.parentPrefix).toBe("block");
    });

    it("produces parentPrefix for &--modifier nested definitions", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.scss", `.card {\n  &--active {\n    opacity: 1;\n  }\n}`);

      const result = await getRename("card--active", fixturesDir, DEFAULT_CONFIG, index);

      const edit = result.edits.find((e) => e.filePath === "/test.scss" && e.parentPrefix);
      expect(edit).toBeDefined();
      expect(edit!.parentPrefix).toBe("card");
    });

    it("produces parentPrefix for non-BEM compound like &-sub", async () => {
      const index = new CssClassIndex(DEFAULT_CONFIG);
      await index.indexFile("/test.scss", `.block--element {\n  &-sub {\n    color: red;\n  }\n}`);

      const result = await getRename("block--element-sub", fixturesDir, DEFAULT_CONFIG, index);

      const edit = result.edits.find((e) => e.filePath === "/test.scss" && e.parentPrefix);
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
    it("returns plain new name for non-cascade edits", () => {
      const edit: RenameEdit = { filePath: "/f.css", line: 0, column: 1, endColumn: 5 };
      expect(computeNewText(edit, "btn", "button")).toBe("button");
    });

    it("produces &-suffixed new text for SCSS nested when prefix is preserved", () => {
      const edit: RenameEdit = {
        filePath: "/f.scss", line: 1, column: 2, endColumn: 12,
        parentPrefix: "block",
        originalClassName: "block__element",
      };
      // Renaming block → card, so block__element → card__element
      expect(computeNewText(edit, "block", "card")).toBe("&__element");
    });

    it("computes cascade replacement for BEM child in templates", () => {
      const edit: RenameEdit = {
        filePath: "/f.html", line: 0, column: 12, endColumn: 28,
        originalClassName: "overlay__spacer",
      };
      // Renaming "overlay" → "panel", expect "overlay__spacer" → "panel__spacer"
      expect(computeNewText(edit, "overlay", "panel")).toBe("panel__spacer");
    });

    it("computes cascade replacement for modifier child", () => {
      const edit: RenameEdit = {
        filePath: "/f.html", line: 0, column: 12, endColumn: 28,
        originalClassName: "overlay--active",
      };
      expect(computeNewText(edit, "overlay", "panel")).toBe("panel--active");
    });

    it("returns full new name when SCSS prefix changes (breaks nesting)", () => {
      const edit: RenameEdit = {
        filePath: "/f.scss", line: 1, column: 2, endColumn: 12,
        parentPrefix: "block",
        originalClassName: "block__element",
      };
      // Renaming block__element directly (no cascade, oldName = originalClassName)
      expect(computeNewText(edit, "block__element", "card__element")).toBe("card__element");
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

      const aEdits = result.edits.filter((e) => e.filePath === "/a.css");
      const bEdits = result.edits.filter((e) => e.filePath === "/b.css");
      expect(aEdits).toHaveLength(1);
      expect(bEdits).toHaveLength(0);
    });
  });
});
