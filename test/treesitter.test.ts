import { describe, it, expect, beforeAll } from "vitest";
import { initTreeSitter, preloadGrammars } from "../src/parsers/treesitter/init.js";
import { parseCssClasses } from "../src/parsers/treesitter/css-parser.js";
import { parseHtmlClasses } from "../src/parsers/treesitter/html-parser.js";
import { parseReactClasses } from "../src/parsers/treesitter/react-parser.js";
import { parseVueClasses } from "../src/parsers/treesitter/vue-parser.js";

// Tree-sitter WASM initialization must happen once before all tests
beforeAll(async () => {
  await initTreeSitter();
  await preloadGrammars();
}, 30_000);

// ─── CSS Parser ─────────────────────────────────────────────────────────────

describe("Tree-sitter CSS Parser", () => {
  it("extracts simple class selectors", async () => {
    const css = `.foo { color: red; }\n.bar { color: blue; }`;
    const classes = await parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
  });

  it("extracts comma-separated selectors", async () => {
    const css = `.card, .panel { border: 1px solid; }`;
    const classes = await parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).toContain("card");
    expect(names).toContain("panel");
  });

  it("extracts compound selectors", async () => {
    const css = `.btn.active { background: blue; }`;
    const classes = await parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).toContain("btn");
    expect(names).toContain("active");
  });

  it("skips content in comments", async () => {
    const css = `/* .commented { } */\n.real { color: red; }`;
    const classes = await parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).not.toContain("commented");
    expect(names).toContain("real");
  });

  it("handles descendant selectors", async () => {
    const css = `.parent .child { color: red; }`;
    const classes = await parseCssClasses(css, "/test.css");

    const names = classes.map((c) => c.className);
    expect(names).toContain("parent");
    expect(names).toContain("child");
  });

  it("records correct line numbers", async () => {
    const css = `.first { }\n\n.third { }`;
    const classes = await parseCssClasses(css, "/test.css");

    const first = classes.find((c) => c.className === "first");
    const third = classes.find((c) => c.className === "third");

    expect(first?.line).toBe(0);
    expect(third?.line).toBe(2);
  });

  it("records file path", async () => {
    const css = `.foo { }`;
    const classes = await parseCssClasses(css, "/my/styles.css");

    expect(classes[0].filePath).toBe("/my/styles.css");
  });

  it("handles @media rules", async () => {
    const css = `@media (max-width: 768px) { .mobile { display: block; } }`;
    const classes = await parseCssClasses(css, "/test.css");

    expect(classes.map((c) => c.className)).toContain("mobile");
  });

  it("detects BEM patterns", async () => {
    const css = `.card__header--highlighted { color: red; }`;
    const classes = await parseCssClasses(css, "/test.css");

    const cls = classes.find((c) => c.className === "card__header--highlighted");
    expect(cls).toBeDefined();
    expect(cls?.bem).toBeTruthy();
    expect(cls?.bem?.block).toBe("card");
    expect(cls?.bem?.element).toBe("header");
    expect(cls?.bem?.modifier).toBe("highlighted");
  });
});

// ─── HTML Parser ────────────────────────────────────────────────────────────

describe("Tree-sitter HTML Parser", () => {
  it("extracts classes from class attribute", async () => {
    const html = `<div class="foo bar baz"></div>`;
    const refs = await parseHtmlClasses(html, "/test.html");

    const names = refs.map((r) => r.className);
    expect(names).toEqual(["foo", "bar", "baz"]);
  });

  it("extracts classes from single-quoted attribute", async () => {
    const html = `<div class='foo bar'></div>`;
    const refs = await parseHtmlClasses(html, "/test.html");

    expect(refs.map((r) => r.className)).toEqual(["foo", "bar"]);
  });

  it("handles multiple elements", async () => {
    const html = `<div class="foo"></div>\n<span class="bar baz"></span>`;
    const refs = await parseHtmlClasses(html, "/test.html");

    expect(refs.map((r) => r.className)).toEqual(["foo", "bar", "baz"]);
  });

  it("handles BEM class names", async () => {
    const html = `<div class="card__header--highlighted"></div>`;
    const refs = await parseHtmlClasses(html, "/test.html");

    expect(refs[0].className).toBe("card__header--highlighted");
  });

  it("records correct positions", async () => {
    const html = `<div class="foo bar"></div>`;
    const refs = await parseHtmlClasses(html, "/test.html");

    const foo = refs.find((r) => r.className === "foo");
    expect(foo?.line).toBe(0);
    expect(foo?.column).toBe(12);
    expect(foo?.endColumn).toBe(15);

    const bar = refs.find((r) => r.className === "bar");
    expect(bar?.column).toBe(16);
  });

  it("handles empty class attribute", async () => {
    const html = `<div class=""></div>`;
    const refs = await parseHtmlClasses(html, "/test.html");

    expect(refs).toHaveLength(0);
  });

  it("handles multi-line attributes", async () => {
    const html = `<div\n  class="foo bar"\n></div>`;
    const refs = await parseHtmlClasses(html, "/test.html");

    expect(refs.map((r) => r.className)).toEqual(["foo", "bar"]);
    expect(refs[0].line).toBe(1);
  });
});

// ─── React Parser ───────────────────────────────────────────────────────────

describe("Tree-sitter React Parser", () => {
  it("extracts className string literals", async () => {
    const tsx = `const App = () => <div className="foo bar"></div>;`;
    const refs = await parseReactClasses(tsx, "/test.tsx");

    const names = refs.map((r) => r.className);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
  });

  it("extracts clsx utility calls", async () => {
    const tsx = `const App = () => <div className={clsx('menu', 'active')}></div>;`;
    const refs = await parseReactClasses(tsx, "/test.tsx");

    const names = refs.map((r) => r.className);
    expect(names).toContain("menu");
    expect(names).toContain("active");
  });

  it("extracts CSS module dot access", async () => {
    const tsx = `import styles from './app.module.css';\nconst App = () => <div className={styles.container}></div>;`;
    const refs = await parseReactClasses(tsx, "/test.tsx");

    expect(refs.map((r) => r.className)).toContain("container");
  });

  it("extracts CSS module bracket access", async () => {
    const tsx = `import styles from './app.module.css';\nconst App = () => <div className={styles['nav-bar']}></div>;`;
    const refs = await parseReactClasses(tsx, "/test.tsx");

    expect(refs.map((r) => r.className)).toContain("nav-bar");
  });

  it("extracts template literal static segments", async () => {
    const tsx = `const App = ({ active }) => <div className={\`card \${active ? 'active' : ''} bordered\`}></div>;`;
    const refs = await parseReactClasses(tsx, "/test.tsx");

    const names = refs.map((r) => r.className);
    expect(names).toContain("card");
    expect(names).toContain("bordered");
    expect(names).toContain("active");
  });
});

// ─── Vue Parser ─────────────────────────────────────────────────────────────

describe("Tree-sitter Vue Parser", () => {
  it("extracts static class attributes", async () => {
    const vue = `<template>\n  <div class="container header"></div>\n</template>`;
    const refs = await parseVueClasses(vue, "/test.vue");

    const names = refs.map((r) => r.className);
    expect(names).toContain("container");
    expect(names).toContain("header");
  });

  it("extracts dynamic :class object syntax", async () => {
    const vue = `<template>\n  <div :class="{ 'is-active': active, disabled: true }"></div>\n</template>`;
    const refs = await parseVueClasses(vue, "/test.vue");

    const names = refs.map((r) => r.className);
    expect(names).toContain("is-active");
    expect(names).toContain("disabled");
  });

  it("extracts dynamic :class array syntax", async () => {
    const vue = `<template>\n  <div :class="['foo', condition ? 'bar' : 'baz']"></div>\n</template>`;
    const refs = await parseVueClasses(vue, "/test.vue");

    const names = refs.map((r) => r.className);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
    expect(names).toContain("baz");
  });

  it("extracts v-bind:class syntax", async () => {
    const vue = `<template>\n  <div v-bind:class="'highlighted'"></div>\n</template>`;
    const refs = await parseVueClasses(vue, "/test.vue");

    expect(refs.map((r) => r.className)).toContain("highlighted");
  });
});
