import { describe, it, expect } from "vitest";
import { parseVueClasses } from "../src/parsers/vue-parser.js";

describe("Vue Parser", () => {
  describe("static classes", () => {
    it("extracts from class attribute in template", () => {
      const vue = `<template>\n  <div class="foo bar"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("foo");
      expect(names).toContain("bar");
    });
  });

  describe("object syntax", () => {
    it("extracts quoted keys from :class object", () => {
      const vue = `<template>\n  <div :class="{ 'header': true, 'header--sticky': isSticky }"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("header");
      expect(names).toContain("header--sticky");
    });

    it("extracts unquoted keys from :class object", () => {
      const vue = `<template>\n  <div :class="{ active: isActive, disabled: isDisabled }"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("active");
      expect(names).toContain("disabled");
    });

    it("does not detect object values as class names", () => {
      const vue = `<template>\n  <div :class="{ 'my-class': isEnabled }"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("my-class");
      expect(names).not.toContain("isEnabled");
    });

    it("does not detect boolean/variable values from :class binding", () => {
      const vue = `<template>\n  <div :class="{ 'card': showCard, 'card--active': isActive }"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("card");
      expect(names).toContain("card--active");
      expect(names).not.toContain("showCard");
      expect(names).not.toContain("isActive");
    });
  });

  describe("array syntax", () => {
    it("extracts string literals from :class array", () => {
      const vue = `<template>\n  <div :class="['foo', 'bar']"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("foo");
      expect(names).toContain("bar");
    });

    it("extracts from ternary in array", () => {
      const vue = `<template>\n  <div :class="[isActive ? 'active' : 'inactive']"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("active");
      expect(names).toContain("inactive");
    });
  });

  describe("string syntax", () => {
    it("extracts from :class string literal", () => {
      const vue = `<template>\n  <div :class="'card card--featured'"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("card");
      expect(names).toContain("card--featured");
    });
  });

  describe("v-bind:class", () => {
    it("extracts from v-bind:class alias", () => {
      const vue = `<template>\n  <div v-bind:class="{ active: true }"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("active");
    });
  });

  describe("mixed static and dynamic", () => {
    it("extracts from both class and :class", () => {
      const vue = `<template>\n  <div class="base" :class="{ active: isActive }"></div>\n</template>`;
      const refs = parseVueClasses(vue, "/test.vue");

      const names = refs.map((r) => r.className);
      expect(names).toContain("base");
      expect(names).toContain("active");
    });
  });
});
