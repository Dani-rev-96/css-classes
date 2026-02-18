import { describe, it, expect } from "vitest";
import { parseBem, isBem, bemParents, bemTargetAtOffset } from "../src/utils/bem.js";

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

  describe("bemTargetAtOffset", () => {
    // "card__header--active"
    //  0123456789...
    //  block=card (0-3), __header (4-11), --active (12-19)

    it("returns block when cursor is on block part", () => {
      expect(bemTargetAtOffset("card__header--active", 0)).toBe("card");
      expect(bemTargetAtOffset("card__header--active", 2)).toBe("card");
      expect(bemTargetAtOffset("card__header--active", 3)).toBe("card");
    });

    it("returns block__element when cursor is on element separator", () => {
      expect(bemTargetAtOffset("card__header--active", 4)).toBe("card__header");
      expect(bemTargetAtOffset("card__header--active", 5)).toBe("card__header");
    });

    it("returns block__element when cursor is on element name", () => {
      expect(bemTargetAtOffset("card__header--active", 6)).toBe("card__header");
      expect(bemTargetAtOffset("card__header--active", 11)).toBe("card__header");
    });

    it("returns full class when cursor is on modifier separator", () => {
      expect(bemTargetAtOffset("card__header--active", 12)).toBe("card__header--active");
      expect(bemTargetAtOffset("card__header--active", 13)).toBe("card__header--active");
    });

    it("returns full class when cursor is on modifier name", () => {
      expect(bemTargetAtOffset("card__header--active", 14)).toBe("card__header--active");
      expect(bemTargetAtOffset("card__header--active", 19)).toBe("card__header--active");
    });

    it("returns block for block__element (no modifier)", () => {
      // "card__header"  block=card (0-3), __header (4-11)
      expect(bemTargetAtOffset("card__header", 0)).toBe("card");
      expect(bemTargetAtOffset("card__header", 3)).toBe("card");
      expect(bemTargetAtOffset("card__header", 4)).toBe("card__header");
      expect(bemTargetAtOffset("card__header", 11)).toBe("card__header");
    });

    it("returns block for block--modifier (no element)", () => {
      // "card--featured"  block=card (0-3), --featured (4-13)
      expect(bemTargetAtOffset("card--featured", 0)).toBe("card");
      expect(bemTargetAtOffset("card--featured", 3)).toBe("card");
      expect(bemTargetAtOffset("card--featured", 4)).toBe("card--featured");
      expect(bemTargetAtOffset("card--featured", 13)).toBe("card--featured");
    });

    it("returns full class for non-BEM class names", () => {
      expect(bemTargetAtOffset("container", 3)).toBe("container");
    });

    it("returns full class for plain block (no element or modifier)", () => {
      expect(bemTargetAtOffset("card", 2)).toBe("card");
    });

    it("handles hyphenated BEM names", () => {
      // "my-card__my-header--is-active"
      // block=my-card (0-6), __my-header (7-17), --is-active (18-28)
      expect(bemTargetAtOffset("my-card__my-header--is-active", 0)).toBe("my-card");
      expect(bemTargetAtOffset("my-card__my-header--is-active", 6)).toBe("my-card");
      expect(bemTargetAtOffset("my-card__my-header--is-active", 7)).toBe("my-card__my-header");
      expect(bemTargetAtOffset("my-card__my-header--is-active", 17)).toBe("my-card__my-header");
      expect(bemTargetAtOffset("my-card__my-header--is-active", 18)).toBe("my-card__my-header--is-active");
      expect(bemTargetAtOffset("my-card__my-header--is-active", 28)).toBe("my-card__my-header--is-active");
    });

    it("supports custom separators", () => {
      // "card-header_active" with element="-", modifier="_"
      // block=card (0-3), -header (4-10), _active (11-17)
      expect(bemTargetAtOffset("card-header_active", 0, "-", "_")).toBe("card");
      expect(bemTargetAtOffset("card-header_active", 3, "-", "_")).toBe("card");
      expect(bemTargetAtOffset("card-header_active", 4, "-", "_")).toBe("card-header");
      expect(bemTargetAtOffset("card-header_active", 10, "-", "_")).toBe("card-header");
      expect(bemTargetAtOffset("card-header_active", 11, "-", "_")).toBe("card-header_active");
    });
  });
});
