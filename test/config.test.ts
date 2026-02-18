import { describe, it, expect } from "vitest";
import { resolveConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/types.js";

describe("Config", () => {
  it("returns defaults when no config is provided", () => {
    const config = resolveConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("returns defaults when empty object is provided", () => {
    const config = resolveConfig({});
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("overrides includePatterns", () => {
    const config = resolveConfig({ includePatterns: ["**/*.less"] });
    expect(config.includePatterns).toEqual(["**/*.less"]);
  });

  it("overrides nested language flags", () => {
    const config = resolveConfig({
      languages: { html: false, vue: true, react: false },
    });
    expect(config.languages.html).toBe(false);
    expect(config.languages.vue).toBe(true);
    expect(config.languages.react).toBe(false);
  });

  it("overrides BEM separators", () => {
    const config = resolveConfig({
      bemSeparators: { element: "-", modifier: "_" },
    });
    expect(config.bemSeparators.element).toBe("-");
    expect(config.bemSeparators.modifier).toBe("_");
  });

  it("ignores invalid types", () => {
    const config = resolveConfig({
      includePatterns: 42 as unknown,
      bemEnabled: "yes" as unknown,
    } as Record<string, unknown>);
    expect(config.includePatterns).toEqual(DEFAULT_CONFIG.includePatterns);
    expect(config.bemEnabled).toEqual(DEFAULT_CONFIG.bemEnabled);
  });
});
