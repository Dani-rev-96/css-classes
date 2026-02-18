import { describe, it, expect } from "vitest";
import { parseCssClasses, extractStyleBlocks } from "../src/parsers/css-parser.js";

describe("CSS Parser", () => {
  it("extracts simple class selectors", () => {
    const css = `.foo { color: red; }\n.bar { color: blue; }`;
    const classes = parseCssClasses(css, "/test.css");

    expect(classes.map((c) => c.className)).toContain("foo");
    expect(classes.map((c) => c.className)).toContain("bar");
  });

  it("extracts comma-separated selectors", () => {
    const css = `.card, .panel { border: 1px solid; }`;
    const classes = parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).toContain("card");
    expect(names).toContain("panel");
  });

  it("extracts compound selectors", () => {
    const css = `.btn.active { background: blue; }`;
    const classes = parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).toContain("btn");
    expect(names).toContain("active");
  });

  it("skips content in comments", () => {
    const css = `/* .commented { } */\n.real { color: red; }`;
    const classes = parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).not.toContain("commented");
    expect(names).toContain("real");
  });

  it("handles descendant selectors", () => {
    const css = `.parent .child { color: red; }`;
    const classes = parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).toContain("parent");
    expect(names).toContain("child");
  });

  it("records correct line numbers", () => {
    const css = `.first { }\n\n.third { }`;
    const classes = parseCssClasses(css, "/test.css");

    const first = classes.find((c) => c.className === "first");
    const third = classes.find((c) => c.className === "third");

    expect(first?.line).toBe(0);
    expect(third?.line).toBe(2);
  });

  it("records file path", () => {
    const css = `.foo { }`;
    const classes = parseCssClasses(css, "/my/styles.css");

    expect(classes[0].filePath).toBe("/my/styles.css");
  });
});

describe("SCSS Nesting", () => {
  it("resolves & parent selector for BEM elements", () => {
    const scss = `.card {\n  &__header {\n    padding: 16px;\n  }\n}`;
    const classes = parseCssClasses(scss, "/test.scss");

    const names = classes.map((c) => c.className);
    expect(names).toContain("card");
    expect(names).toContain("card__header");
  });

  it("resolves & parent selector for BEM modifiers", () => {
    const scss = `.card {\n  &--featured {\n    border: gold;\n  }\n}`;
    const classes = parseCssClasses(scss, "/test.scss");

    const names = classes.map((c) => c.className);
    expect(names).toContain("card");
    expect(names).toContain("card--featured");
  });

  it("resolves deep nesting", () => {
    const scss = `.card {\n  &__header {\n    &--highlighted {\n      bg: yellow;\n    }\n  }\n}`;
    const classes = parseCssClasses(scss, "/test.scss");

    const names = classes.map((c) => c.className);
    expect(names).toContain("card");
    expect(names).toContain("card__header");
    expect(names).toContain("card__header--highlighted");
  });

  it("handles nesting without &", () => {
    const scss = `.sidebar {\n  .menu {\n    list-style: none;\n  }\n}`;
    const classes = parseCssClasses(scss, "/test.scss");

    const names = classes.map((c) => c.className);
    expect(names).toContain("sidebar");
    expect(names).toContain("menu");
  });

  it("marks nested classes as nested", () => {
    const scss = `.card {\n  &__header {\n    padding: 16px;\n  }\n}`;
    const classes = parseCssClasses(scss, "/test.scss");

    const header = classes.find((c) => c.className === "card__header");
    expect(header?.nested).toBe(true);

    const card = classes.find((c) => c.className === "card");
    expect(card?.nested).toBe(false);
  });
});

describe("BEM Detection", () => {
  it("detects BEM parts on parsed classes", () => {
    const scss = `.card {\n  &__header {\n    &--highlighted {\n      bg: yellow;\n    }\n  }\n}`;
    const classes = parseCssClasses(scss, "/test.scss");

    const highlighted = classes.find((c) => c.className === "card__header--highlighted");
    expect(highlighted?.bem).toEqual({
      block: "card",
      element: "header",
      modifier: "highlighted",
    });
  });

  it("detects block-level BEM", () => {
    const css = `.card { }`;
    const classes = parseCssClasses(css, "/test.css");

    const card = classes.find((c) => c.className === "card");
    expect(card?.bem).toEqual({
      block: "card",
      element: null,
      modifier: null,
    });
  });
});

describe("extractStyleBlocks", () => {
  it("extracts style blocks from Vue-like content", () => {
    const content = `<template><div></div></template>\n<style lang="scss">\n.foo { }\n</style>`;
    const blocks = extractStyleBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe("scss");
    expect(blocks[0].content).toContain(".foo");
  });

  it("extracts multiple style blocks", () => {
    const content = `<style>.a { }</style>\n<style scoped>.b { }</style>`;
    const blocks = extractStyleBlocks(content);

    expect(blocks).toHaveLength(2);
  });
});
