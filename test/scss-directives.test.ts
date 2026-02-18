import { describe, it, expect } from "vitest";
import { parseScssDirectives } from "../src/parsers/css-parser.js";

describe("SCSS Directives Parser", () => {
  describe("@mixin", () => {
    it("extracts simple mixin definition", () => {
      const scss = `@mixin reset-list {\n  margin: 0;\n  padding: 0;\n}`;
      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.mixins).toHaveLength(1);
      expect(result.mixins[0].name).toBe("reset-list");
      expect(result.mixins[0].line).toBe(0);
      expect(result.mixins[0].parameters).toEqual([]);
    });

    it("extracts mixin with parameters", () => {
      const scss = `@mixin respond-to($breakpoint, $direction: min) {\n  @media (#{$direction}-width: $breakpoint) { @content; }\n}`;
      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.mixins).toHaveLength(1);
      expect(result.mixins[0].name).toBe("respond-to");
      expect(result.mixins[0].parameters).toEqual(["breakpoint", "direction"]);
    });

    it("extracts multiple mixins", () => {
      const scss = [
        `@mixin flex-center {`,
        `  display: flex;`,
        `  align-items: center;`,
        `}`,
        ``,
        `@mixin text-ellipsis {`,
        `  overflow: hidden;`,
        `  text-overflow: ellipsis;`,
        `}`,
      ].join("\n");

      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.mixins).toHaveLength(2);
      expect(result.mixins[0].name).toBe("flex-center");
      expect(result.mixins[1].name).toBe("text-ellipsis");
      expect(result.mixins[1].line).toBe(5);
    });

    it("records correct file path", () => {
      const scss = `@mixin foo {\n  color: red;\n}`;
      const result = parseScssDirectives(scss, "/path/to/styles.scss");

      expect(result.mixins[0].filePath).toBe("/path/to/styles.scss");
    });
  });

  describe("@extend", () => {
    it("extracts simple @extend", () => {
      const scss = `.error {\n  color: red;\n}\n\n.alert {\n  @extend .error;\n  font-weight: bold;\n}`;
      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.extends).toHaveLength(1);
      expect(result.extends[0].targetClassName).toBe("error");
      expect(result.extends[0].sourceClassName).toBe("alert");
      expect(result.extends[0].line).toBe(5);
    });

    it("extracts multiple @extend", () => {
      const scss = [
        `.base { color: red; }`,
        `.primary { background: blue; }`,
        ``,
        `.btn {`,
        `  @extend .base;`,
        `  @extend .primary;`,
        `}`,
      ].join("\n");

      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.extends).toHaveLength(2);
      expect(result.extends[0].targetClassName).toBe("base");
      expect(result.extends[0].sourceClassName).toBe("btn");
      expect(result.extends[1].targetClassName).toBe("primary");
      expect(result.extends[1].sourceClassName).toBe("btn");
    });

    it("handles @extend in nested context", () => {
      const scss = [
        `.card {`,
        `  border: 1px solid;`,
        `  &__header {`,
        `    @extend .typography-heading;`,
        `  }`,
        `}`,
      ].join("\n");

      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.extends).toHaveLength(1);
      expect(result.extends[0].targetClassName).toBe("typography-heading");
    });

    it("records correct file path", () => {
      const scss = `.a {\n  @extend .b;\n}`;
      const result = parseScssDirectives(scss, "/path/styles.scss");

      expect(result.extends[0].filePath).toBe("/path/styles.scss");
    });
  });

  describe("@include", () => {
    it("extracts simple @include", () => {
      const scss = `.card {\n  @include reset-list;\n}`;
      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.includes).toHaveLength(1);
      expect(result.includes[0].mixinName).toBe("reset-list");
      expect(result.includes[0].contextClassName).toBe("card");
      expect(result.includes[0].line).toBe(1);
    });

    it("extracts @include with arguments", () => {
      const scss = `.responsive {\n  @include respond-to(768px);\n}`;
      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.includes).toHaveLength(1);
      expect(result.includes[0].mixinName).toBe("respond-to");
      expect(result.includes[0].contextClassName).toBe("responsive");
    });

    it("extracts namespaced @include", () => {
      const scss = `.card {\n  @include m.respond-to(medium);\n}`;
      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.includes).toHaveLength(1);
      expect(result.includes[0].mixinName).toBe("m.respond-to");
    });

    it("extracts multiple @include", () => {
      const scss = [
        `.btn {`,
        `  @include reset-list;`,
        `  @include flex-center;`,
        `  @include respond-to(768px);`,
        `}`,
      ].join("\n");

      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.includes).toHaveLength(3);
      expect(result.includes.map((i) => i.mixinName)).toEqual([
        "reset-list",
        "flex-center",
        "respond-to",
      ]);
    });

    it("returns null contextClassName for root-level @include", () => {
      const scss = `@include global-reset;`;
      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.includes).toHaveLength(1);
      expect(result.includes[0].contextClassName).toBeNull();
    });
  });

  describe("combined", () => {
    it("extracts all directive types from a complex file", () => {
      const scss = [
        `@mixin respond-to($bp) {`,
        `  @media (min-width: $bp) { @content; }`,
        `}`,
        ``,
        `@mixin flex-center {`,
        `  display: flex;`,
        `  align-items: center;`,
        `}`,
        ``,
        `.base-card {`,
        `  padding: 1rem;`,
        `}`,
        ``,
        `.feature-card {`,
        `  @extend .base-card;`,
        `  @include flex-center;`,
        `  @include respond-to(768px);`,
        `}`,
      ].join("\n");

      const result = parseScssDirectives(scss, "/test.scss");

      expect(result.mixins).toHaveLength(2);
      expect(result.extends).toHaveLength(1);
      expect(result.includes).toHaveLength(2);

      expect(result.extends[0].targetClassName).toBe("base-card");
      expect(result.extends[0].sourceClassName).toBe("feature-card");
    });

    it("ignores directives inside comments", () => {
      const scss = [
        `/* @mixin commented-out { } */`,
        `.real {`,
        `  color: red;`,
        `}`,
      ].join("\n");

      const result = parseScssDirectives(scss, "/test.scss");
      expect(result.mixins).toHaveLength(0);
    });

    it("returns empty for plain CSS", () => {
      const css = `.foo { color: red; }\n.bar { background: blue; }`;
      const result = parseScssDirectives(css, "/test.css");

      expect(result.mixins).toHaveLength(0);
      expect(result.extends).toHaveLength(0);
      expect(result.includes).toHaveLength(0);
    });
  });
});
