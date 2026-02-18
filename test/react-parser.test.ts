import { describe, it, expect } from "vitest";
import { parseReactClasses } from "../src/parsers/react-parser.js";

describe("React Parser", () => {
  describe("static className", () => {
    it("extracts from className string attribute", () => {
      const jsx = `<div className="foo bar"></div>`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      const names = refs.map((r) => r.className);
      expect(names).toContain("foo");
      expect(names).toContain("bar");
    });

    it("extracts from single-quoted className", () => {
      const jsx = `<div className='foo bar'></div>`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      expect(refs.map((r) => r.className)).toContain("foo");
    });
  });

  describe("dynamic className", () => {
    it("extracts string literals from className expression", () => {
      const jsx = `<div className={'foo bar'}></div>`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      const names = refs.map((r) => r.className);
      expect(names).toContain("foo");
      expect(names).toContain("bar");
    });

    it("extracts from template literal", () => {
      const jsx = "<div className={`card active`}></div>";
      const refs = parseReactClasses(jsx, "/test.tsx");

      const names = refs.map((r) => r.className);
      expect(names).toContain("card");
      expect(names).toContain("active");
    });
  });

  describe("utility functions", () => {
    it("extracts from clsx() call", () => {
      const jsx = `<div className={clsx('foo', 'bar')}></div>`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      const names = refs.map((r) => r.className);
      expect(names).toContain("foo");
      expect(names).toContain("bar");
    });

    it("extracts from classNames() call", () => {
      const jsx = `<div className={classNames('nav__item', { 'nav__item--active': true })}></div>`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      const names = refs.map((r) => r.className);
      expect(names).toContain("nav__item");
      expect(names).toContain("nav__item--active");
    });

    it("extracts from cn() call", () => {
      const jsx = `const cls = cn('base', condition && 'active');`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      const names = refs.map((r) => r.className);
      expect(names).toContain("base");
      expect(names).toContain("active");
    });

    it("extracts object keys from utility calls", () => {
      const jsx = `clsx({ 'card--featured': featured, disabled: isDisabled })`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      const names = refs.map((r) => r.className);
      expect(names).toContain("card--featured");
      expect(names).toContain("disabled");
    });
  });

  describe("CSS Modules", () => {
    it("extracts dot-access module references", () => {
      const jsx = `<span className={styles.icon}></span>`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      expect(refs.map((r) => r.className)).toContain("icon");
    });

    it("extracts bracket-access module references", () => {
      const jsx = `<span className={styles['item-label']}></span>`;
      const refs = parseReactClasses(jsx, "/test.tsx");

      expect(refs.map((r) => r.className)).toContain("item-label");
    });
  });
});
