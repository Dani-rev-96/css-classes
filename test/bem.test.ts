import { describe, it, expect } from "vitest";
import { parseBem, isBem, bemParents } from "../src/utils/bem.js";

describe("BEM Utils", () => {
  describe("parseBem", () => {
    it("parses block only", () => {
      expect(parseBem("card")).toEqual({ block: "card", element: null, modifier: null });
    });

    it("parses block__element", () => {
      expect(parseBem("card__header")).toEqual({ block: "card", element: "header", modifier: null });
    });

    it("parses block--modifier", () => {
      expect(parseBem("card--featured")).toEqual({ block: "card", element: null, modifier: "featured" });
    });

    it("parses block__element--modifier", () => {
      expect(parseBem("card__header--highlighted")).toEqual({
        block: "card",
        element: "header",
        modifier: "highlighted",
      });
    });

    it("handles hyphenated names", () => {
      expect(parseBem("my-card__my-header--is-active")).toEqual({
        block: "my-card",
        element: "my-header",
        modifier: "is-active",
      });
    });

    it("returns null for empty string", () => {
      expect(parseBem("")).toBeNull();
    });

    it("returns null for invalid starting separator", () => {
      expect(parseBem("__element")).toBeNull();
      expect(parseBem("--modifier")).toBeNull();
    });
  });

  describe("isBem", () => {
    it("returns false for plain block", () => {
      expect(isBem("card")).toBe(false);
    });

    it("returns true for element", () => {
      expect(isBem("card__header")).toBe(true);
    });

    it("returns true for modifier", () => {
      expect(isBem("card--featured")).toBe(true);
    });
  });

  describe("bemParents", () => {
    it("returns empty for plain block", () => {
      expect(bemParents("card")).toEqual([]);
    });

    it("returns block for element", () => {
      expect(bemParents("card__header")).toEqual(["card"]);
    });

    it("returns block for block--modifier", () => {
      expect(bemParents("card--featured")).toEqual(["card"]);
    });

    it("returns block and element for element--modifier", () => {
      expect(bemParents("card__header--active")).toEqual(["card", "card__header"]);
    });
  });
});
