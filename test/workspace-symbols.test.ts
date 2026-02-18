import { describe, it, expect } from "vitest";
import { getWorkspaceSymbols } from "../src/core/workspace-symbols.js";
import { CssClassIndex } from "../src/core/css-index.js";
import { DEFAULT_CONFIG } from "../src/types.js";

async function indexWith(css: string, filePath = "/test.css"): Promise<CssClassIndex> {
  const index = new CssClassIndex(DEFAULT_CONFIG);
  await index.indexFile(filePath, css);
  return index;
}

describe("Workspace Symbols", () => {
  it("returns matching symbols by prefix", async () => {
    const index = await indexWith(`.btn { }\n.btn-primary { }\n.card { }`);
    const symbols = getWorkspaceSymbols("btn", index);

    const names = symbols.map((s) => s.name);
    expect(names).toContain("btn");
    expect(names).toContain("btn-primary");
    expect(names).not.toContain("card");
  });

  it("returns all symbols for empty query", async () => {
    const index = await indexWith(`.foo { }\n.bar { }\n.baz { }`);
    const symbols = getWorkspaceSymbols("", index);

    expect(symbols.length).toBeGreaterThanOrEqual(3);
  });

  it("returns contains matches after prefix matches", async () => {
    const index = await indexWith(`.my-btn { }\n.btn-big { }\n.card { }`);
    const symbols = getWorkspaceSymbols("btn", index);

    const names = symbols.map((s) => s.name);
    // btn-big is prefix match, my-btn is contains match
    expect(names).toContain("btn-big");
    expect(names).toContain("my-btn");
    expect(names).not.toContain("card");
  });

  it("returns fuzzy matches", async () => {
    const index = await indexWith(`.button-primary { }\n.card { }`);
    const symbols = getWorkspaceSymbols("bp", index);

    const names = symbols.map((s) => s.name);
    // "bp" fuzzy matches "button-primary" (b...p)
    expect(names).toContain("button-primary");
  });

  it("includes file path and location", async () => {
    const index = await indexWith(`.hero { color: red; }`, "/styles/main.css");
    const symbols = getWorkspaceSymbols("hero", index);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe("hero");
    expect(symbols[0].filePath).toBe("/styles/main.css");
    expect(symbols[0].kind).toBe("class");
    expect(symbols[0].line).toBeGreaterThanOrEqual(0);
  });

  it("respects limit", async () => {
    const classes = Array.from({ length: 50 }, (_, i) => `.item-${i} { }`).join("\n");
    const index = await indexWith(classes);
    const symbols = getWorkspaceSymbols("item", index, 10);

    expect(symbols).toHaveLength(10);
  });

  it("returns empty for no matches", async () => {
    const index = await indexWith(`.foo { }\n.bar { }`);
    const symbols = getWorkspaceSymbols("zzz", index);

    expect(symbols).toHaveLength(0);
  });

  it("includes containerName as raw selector", async () => {
    const index = await indexWith(`.nav-item { color: blue; }`);
    const symbols = getWorkspaceSymbols("nav", index);

    expect(symbols.length).toBeGreaterThanOrEqual(1);
    expect(symbols[0].containerName).toBeTruthy();
  });
});
