import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CssClassIndex } from "../src/core/css-index.js";
import { scanWorkspace } from "../src/scanner/workspace-scanner.js";
import { resolveOriginalPosition } from "../src/utils/sourcemap.js";
import {
  parseCssClasses,
  parseScssDirectives,
} from "../src/parsers/css-parser.js";
import { parseReactClasses } from "../src/parsers/react-parser.js";
import { DEFAULT_CONFIG } from "../src/types.js";

describe("Regression: source-map remapped definitions are removable", () => {
  it("re-indexing a compiled file does not duplicate remapped definitions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "css-classes-sm-"));
    const compiled = path.join(dir, "app.css");
    const mapFile = path.join(dir, "app.css.map");

    // compiled line 0 `.foo { color: red; }` maps to original line 0 col 0
    fs.writeFileSync(
      compiled,
      `.foo { color: red; }\n/*# sourceMappingURL=app.css.map */\n`,
    );
    fs.writeFileSync(
      mapFile,
      JSON.stringify({
        version: 3,
        sources: ["../src/app.scss"],
        mappings: "AAAA",
      }),
    );

    const index = new CssClassIndex({ ...DEFAULT_CONFIG });
    await index.indexFile(compiled);

    // Definition should point at the original source
    const defs = index.lookup("foo");
    expect(defs).toHaveLength(1);
    expect(defs[0].filePath).toBe(path.join(dir, "..", "src", "app.scss"));
    expect(defs[0].indexedFrom).toBe(compiled);

    // Re-index the same compiled file: the old remapped definition must be
    // removed first (previously it leaked because fileIndex was keyed by the
    // remapped original path, not the compiled path).
    await index.indexFile(compiled);
    expect(index.lookup("foo")).toHaveLength(1);

    // Deleting the compiled file must remove the remapped definitions too.
    await index.indexFile(compiled); // ensure 1 again after second re-index
    index.removeFile(compiled);
    expect(index.lookup("foo")).toHaveLength(0);
  });

  it("removing the original file does not remove definitions indexed from the compiled file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "css-classes-sm2-"));
    const compiled = path.join(dir, "dist", "app.css");
    fs.mkdirSync(path.dirname(compiled), { recursive: true });
    const original = path.join(dir, "src", "app.scss");
    fs.mkdirSync(path.dirname(original), { recursive: true });

    fs.writeFileSync(
      compiled,
      `.foo { color: red; }\n/*# sourceMappingURL=app.css.map */\n`,
    );
    fs.writeFileSync(
      path.join(path.dirname(compiled), "app.css.map"),
      JSON.stringify({
        version: 3,
        sources: ["../src/app.scss"],
        mappings: "AAAA",
      }),
    );
    fs.writeFileSync(original, `.foo { color: red; }\n`);

    const index = new CssClassIndex({ ...DEFAULT_CONFIG });
    await index.indexFile(compiled); // remapped → original path, indexedFrom=compiled
    await index.indexFile(original); // direct definition under original path

    expect(index.lookup("foo")).toHaveLength(2);

    // Removing the original file must only remove the directly-indexed def,
    // not the one that was produced by indexing the compiled file.
    index.removeFile(original);
    const remaining = index.lookup("foo");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].indexedFrom).toBe(compiled);
  });
});

describe("Regression: malformed source map mappings do not throw", () => {
  it("returns null instead of throwing on invalid VLQ", () => {
    const map = { version: 3, sources: ["a.css"], mappings: "!!!!invalid!!!!" };
    expect(() =>
      resolveOriginalPosition(map, 0, 0, "/x/y.css.map"),
    ).not.toThrow();
    expect(resolveOriginalPosition(map, 0, 0, "/x/y.css.map")).toBeNull();
  });

  it("still resolves valid mappings after a failed decode of another map", () => {
    const bad = { version: 3, sources: ["a.css"], mappings: "!!!" };
    expect(resolveOriginalPosition(bad, 0, 0, "/x/y.css.map")).toBeNull();

    const good = { version: 3, sources: ["../src/a.scss"], mappings: "AAAA" };
    const res = resolveOriginalPosition(good, 0, 0, "/proj/dist/a.css.map");
    expect(res).not.toBeNull();
    expect(res!.originalFilePath).toBe(path.join("/proj", "src", "a.scss"));
  });
});

describe("Regression: url(http://…) is not treated as a // line comment", () => {
  it("closing brace on the same line as a url() still closes the scope", () => {
    const css = [
      `.a { background: url(http://example.com/x.png); }`,
      `.b { color: red; }`,
    ].join("\n");
    const defs = parseCssClasses(css, "/test.css");
    const b = defs.find((d) => d.className === "b");
    expect(b).toBeDefined();
    expect(b!.nested).toBe(false);
    // .b must be a top-level selector, not ".a .b"
    expect(b!.rawSelector).toBe(".b");
  });

  it("real // comments still work in SCSS", () => {
    const scss = [
      `.a {`,
      `  // color: red;`,
      `  background: blue;`,
      `}`,
      `.b { color: red; }`,
    ].join("\n");
    const defs = parseCssClasses(scss, "/test.scss");
    const b = defs.find((d) => d.className === "b");
    expect(b).toBeDefined();
    expect(b!.nested).toBe(false);
  });

  it("directives parser is not corrupted by url(…) with // either", () => {
    // Before the fix, the `}` on the url() line was swallowed by the bogus
    // `//` comment, leaving `.card` on the scope stack — so the root-level
    // @include below got a wrong context of "card" instead of null.
    const scss = [
      `.card { background: url(http://example.com/bg.png); }`,
      `@include after-root;`,
    ].join("\n");
    const result = parseScssDirectives(scss, "/test.scss");
    expect(result.includes).toHaveLength(1);
    expect(result.includes[0].contextClassName).toBeNull();
  });
});

describe("Regression: @extend/@include context uses the selector subject (last class)", () => {
  it("picks the innermost/right-most class of the selector", () => {
    const scss = [`.wrapper .target {`, `  @extend .base;`, `}`].join("\n");
    const result = parseScssDirectives(scss, "/test.scss");
    expect(result.extends).toHaveLength(1);
    expect(result.extends[0].sourceClassName).toBe("target");
  });

  it("resolves & nesting to the subject class", () => {
    const scss = [
      `.card {`,
      `  .card__title {`,
      `    @extend .heading;`,
      `  }`,
      `}`,
    ].join("\n");
    const result = parseScssDirectives(scss, "/test.scss");
    expect(result.extends[0].sourceClassName).toBe("card__title");
  });
});

describe("Regression: gitignore semantics (anchoring + negation)", () => {
  function makeWorkspace(files: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "css-classes-gi-"));
    for (const f of files) {
      const full = path.join(dir, f);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, ".x { color: red; }");
    }
    return dir;
  }

  it("root-anchored pattern does not over-exclude nested same-named dirs", async () => {
    const dir = makeWorkspace([
      ".gitignore",
      "src/generated/a.css",
      "packages/foo/src/generated/b.css",
      "src/main.css",
    ]);
    fs.writeFileSync(path.join(dir, ".gitignore"), "src/generated\n");

    const files = (await scanWorkspace(dir, { ...DEFAULT_CONFIG })).map((f) =>
      path.relative(dir, f).split(path.sep).join("/"),
    );

    expect(files).not.toContain("src/generated/a.css");
    // Previously over-excluded by the naive `**/src/generated/**` conversion:
    expect(files).toContain("packages/foo/src/generated/b.css");
    expect(files).toContain("src/main.css");
  });

  it("negation patterns re-include files", async () => {
    const dir = makeWorkspace([
      ".gitignore",
      "excluded/drop/a.css",
      "excluded/keep/b.css",
      "app.css",
    ]);
    fs.writeFileSync(
      path.join(dir, ".gitignore"),
      // Standard git re-include idiom: exclude children of `excluded/` but
      // re-include `excluded/keep`. (Git cannot re-include files whose parent
      // directory itself is excluded, so `excluded` + `!excluded/keep` alone
      // would NOT work.)
      "excluded/*\n!excluded/keep\n",
    );

    const files = (await scanWorkspace(dir, { ...DEFAULT_CONFIG })).map((f) =>
      path.relative(dir, f).split(path.sep).join("/"),
    );

    expect(files).not.toContain("excluded/drop/a.css");
    // Previously the `!` line was silently dropped, so keep/ stayed excluded:
    expect(files).toContain("excluded/keep/b.css");
    expect(files).toContain("app.css");
  });

  it("unanchored patterns still exclude at any depth", async () => {
    const dir = makeWorkspace([
      ".gitignore",
      "a.min.css",
      "deep/nested/b.min.css",
      "src/app.css",
    ]);
    fs.writeFileSync(path.join(dir, ".gitignore"), "*.min.css\n");

    const files = (await scanWorkspace(dir, { ...DEFAULT_CONFIG })).map((f) =>
      path.relative(dir, f).split(path.sep).join("/"),
    );

    expect(files).not.toContain("a.min.css");
    expect(files).not.toContain("deep/nested/b.min.css");
    expect(files).toContain("src/app.css");
  });
});

describe("Regression: React className quote detection", () => {
  it("single-quoted value containing double quotes keeps correct offsets", () => {
    const content = `const x = <div className='foo "bar"' />;`;
    const refs = parseReactClasses(content, "/test.tsx");
    const foo = refs.find((r) => r.className === "foo");
    expect(foo).toBeDefined();
    // 'foo' starts right after the opening single quote
    const expectedCol = content.indexOf("foo");
    expect(foo!.column).toBe(expectedCol);
    expect(content.slice(foo!.column, foo!.endColumn)).toBe("foo");
  });

  it("double-quoted value still works", () => {
    const content = `const x = <div className="alpha beta" />;`;
    const refs = parseReactClasses(content, "/test.tsx");
    const alpha = refs.find((r) => r.className === "alpha");
    const beta = refs.find((r) => r.className === "beta");
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    expect(content.slice(alpha!.column, alpha!.endColumn)).toBe("alpha");
    expect(content.slice(beta!.column, beta!.endColumn)).toBe("beta");
  });
});
