import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { getRename } from "../src/core/rename.js";
import { CssClassIndex } from "../src/core/css-index.js";
import { DEFAULT_CONFIG } from "../src/types.js";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");

describe("Rename Provider", () => {
  it("collects CSS definition locations for rename", async () => {
    const index = new CssClassIndex(DEFAULT_CONFIG);
    await index.indexFile("/test.css", `.btn { color: red; }\n.btn-primary { color: blue; }`);

    const result = await getRename("btn", fixturesDir, DEFAULT_CONFIG, index);

    // Should have at least the CSS definition
    const cssEdits = result.edits.filter((e) => e.filePath === "/test.css");
    expect(cssEdits.length).toBeGreaterThanOrEqual(1);
    expect(result.oldName).toBe("btn");
  });

  it("collects template references for rename", async () => {
    const index = new CssClassIndex(DEFAULT_CONFIG);
    await index.indexFile("/test.css", `.container { margin: 0; }`);

    // Simulate an open HTML document with a class reference
    const openDocuments = new Map<string, string>();
    openDocuments.set(
      path.join(fixturesDir, "test.html"),
      `<div class="container header"></div>`,
    );

    const result = await getRename("container", fixturesDir, DEFAULT_CONFIG, index, openDocuments);

    // Should include the CSS definition
    const cssEdits = result.edits.filter((e) => e.filePath === "/test.css");
    expect(cssEdits.length).toBeGreaterThanOrEqual(1);

    // Should include the HTML reference
    const htmlEdits = result.edits.filter((e) => e.filePath.endsWith(".html"));
    expect(htmlEdits.length).toBeGreaterThanOrEqual(1);
  });

  it("returns edits with correct column positions", async () => {
    const index = new CssClassIndex(DEFAULT_CONFIG);
    await index.indexFile("/test.css", `.my-class { color: red; }`);

    const result = await getRename("my-class", fixturesDir, DEFAULT_CONFIG, index);

    const cssEdit = result.edits.find((e) => e.filePath === "/test.css");
    expect(cssEdit).toBeDefined();
    // The class name starts after the '.' which is at column 0
    // So the class name "my-class" starts at column 1
    expect(cssEdit!.column).toBe(1);
    expect(cssEdit!.endColumn).toBe(1 + "my-class".length);
  });

  it("handles class with no definitions gracefully", async () => {
    const index = new CssClassIndex(DEFAULT_CONFIG);

    const result = await getRename("nonexistent", fixturesDir, DEFAULT_CONFIG, index);

    // Should still find references in template files even if no CSS def exists
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

    const result = await getRename("header", fixturesDir, DEFAULT_CONFIG, index, openDocuments);

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

    const result = await getRename("card", fixturesDir, DEFAULT_CONFIG, index, openDocuments);

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
