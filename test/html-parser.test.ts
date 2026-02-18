import { describe, it, expect } from "vitest";
import { parseHtmlClasses } from "../src/parsers/html-parser.js";

describe("HTML Parser", () => {
  it("extracts classes from class attribute", () => {
    const html = `<div class="foo bar baz"></div>`;
    const refs = parseHtmlClasses(html, "/test.html");

    const names = refs.map((r) => r.className);
    expect(names).toEqual(["foo", "bar", "baz"]);
  });

  it("extracts classes from single-quoted attribute", () => {
    const html = `<div class='foo bar'></div>`;
    const refs = parseHtmlClasses(html, "/test.html");

    expect(refs.map((r) => r.className)).toEqual(["foo", "bar"]);
  });

  it("handles multiple elements", () => {
    const html = `<div class="foo"></div>\n<span class="bar baz"></span>`;
    const refs = parseHtmlClasses(html, "/test.html");

    expect(refs.map((r) => r.className)).toEqual(["foo", "bar", "baz"]);
  });

  it("handles BEM class names", () => {
    const html = `<div class="card__header--highlighted"></div>`;
    const refs = parseHtmlClasses(html, "/test.html");

    expect(refs[0].className).toBe("card__header--highlighted");
  });

  it("records correct positions", () => {
    const html = `<div class="foo bar"></div>`;
    const refs = parseHtmlClasses(html, "/test.html");

    // "foo" starts after class="
    const foo = refs.find((r) => r.className === "foo");
    expect(foo?.line).toBe(0);
    expect(foo?.column).toBe(12);
    expect(foo?.endColumn).toBe(15);

    const bar = refs.find((r) => r.className === "bar");
    expect(bar?.column).toBe(16);
  });

  it("handles empty class attribute", () => {
    const html = `<div class=""></div>`;
    const refs = parseHtmlClasses(html, "/test.html");

    expect(refs).toHaveLength(0);
  });

  it("handles multi-line attributes", () => {
    const html = `<div\n  class="foo bar"\n></div>`;
    const refs = parseHtmlClasses(html, "/test.html");

    expect(refs.map((r) => r.className)).toEqual(["foo", "bar"]);
    expect(refs[0].line).toBe(1);
  });
});
