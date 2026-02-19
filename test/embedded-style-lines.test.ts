import { describe, it, expect } from "vitest";
import { parseCssClasses, extractStyleBlocks } from "../src/parsers/css-parser.js";

describe("Embedded style block line tracking", () => {
  const vueContent = `<template>
\t<section
\t\tclass="block-cards block"
\t>
\t\t<div class="block-cards__content">
\t\t</div>
\t</section>
</template>

<script setup lang="ts">
import type { Styles } from "#shared/domain/blocks/Block";
</script>

<style scoped lang="scss">
@use "@/styles/variables.scss" as *;
@use "@/styles/block.scss" as *;

.block-cards {
\talign-content: flex-start;
\tmargin: 0 auto;
\twidth: 100%;
\trow-gap: var(--spacing-xs);
\tpadding: var(--spacing);
\t&__content {
\t\tdisplay: grid;
\t\tgrid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
\t\tjustify-self: center;
\t\tgap: var(--spacing-xs);
\t}
\t.block-cards__content {
\t\t:deep(.block) {
\t\t\t--block-surface-color: var(--surface-700);
\t\t\tborder-radius: 8px;
\t\t}
\t}
}
</style>`;

  it("extractStyleBlocks produces correct lineOffset", () => {
    const blocks = extractStyleBlocks(vueContent);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];

    // The <style> tag is on line 18 (0-indexed) / line 19 (1-indexed)
    // The content starts on line 19 (0-indexed) / line 20 (1-indexed)
    // content line 0 is empty (newline after >)
    // content line 1 = @use ... = actual line 20 (1-indexed)
    // So lineOffset should be such that content line 0 maps to
    // the same 0-indexed line as the <style> tag line.

    const lines = vueContent.split("\n");
    const styleTagLine = lines.findIndex((l) => l.includes("<style"));
    // styleTagLine is the 0-indexed line of <style>

    // lineOffset should equal the 0-indexed line number of <style> tag
    // because content line 0 is the tail of <style>'s line (after >)
    expect(block.lineOffset).toBe(styleTagLine);
  });

  it("parseCssClasses assigns correct line to each nested selector", () => {
    const scss = `.block-cards {
\talign-content: flex-start;
\tmargin: 0 auto;
\twidth: 100%;
\trow-gap: var(--spacing-xs);
\tpadding: var(--spacing);
\t&__content {
\t\tdisplay: grid;
\t\tgrid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
\t\tjustify-self: center;
\t\tgap: var(--spacing-xs);
\t}
\t.block-cards__content {
\t\t:deep(.block) {
\t\t\t--block-surface-color: var(--surface-700);
\t\t\tborder-radius: 8px;
\t\t}
\t}
}`;
    const classes = parseCssClasses(scss, "/test.scss");
    const lines = scss.split("\n");

    // Find actual line indices in the SCSS content
    const blockCardsLine = lines.findIndex((l) => l.trim().startsWith(".block-cards {"));
    const ampLine = lines.findIndex((l) => l.trim().startsWith("&__content"));
    const explicitLine = lines.findIndex((l) => l.trim().startsWith(".block-cards__content"));

    // .block-cards is on line 0
    const blockCardsDef = classes.find((c) => c.className === "block-cards");
    expect(blockCardsDef).toBeDefined();
    expect(blockCardsDef!.line).toBe(blockCardsLine);

    // block-cards__content should have 2 entries
    const contentDefs = classes.filter((c) => c.className === "block-cards__content");
    expect(contentDefs).toHaveLength(2);

    const defLines = contentDefs.map((d) => d.line).sort((a, b) => a - b);
    expect(defLines[0]).toBe(ampLine);
    expect(defLines[1]).toBe(explicitLine);
  });

  it("parseCssClasses + lineOffset produce correct 0-indexed lines for embedded styles", () => {
    const blocks = extractStyleBlocks(vueContent);
    const block = blocks[0];
    const classes = parseCssClasses(block.content, "/test/BlockCards.vue");

    // Find the lines in the original Vue content (1-indexed for readability)
    const lines = vueContent.split("\n");

    // .block-cards is defined on the line with ".block-cards {"
    const blockCardsLine = lines.findIndex((l) => l.trim().startsWith(".block-cards {"));
    // &__content is defined on the line with "&__content {"
    const contentLine = lines.findIndex((l) => l.trim().startsWith("&__content {"));
    // .block-cards__content is defined on the line with ".block-cards__content {"
    const fullContentLine = lines.findIndex((l) => l.trim().startsWith(".block-cards__content {"));

    // Verify we found the lines
    expect(blockCardsLine).toBeGreaterThan(0);
    expect(contentLine).toBeGreaterThan(0);
    expect(fullContentLine).toBeGreaterThan(0);

    // Apply the lineOffset to the parser results
    const adjustedClasses = classes.map((c) => ({
      ...c,
      line: c.line + block.lineOffset,
    }));

    // Find specific definitions
    const blockCardsDefs = adjustedClasses.filter((c) => c.className === "block-cards");
    const blockCardsContentDefs = adjustedClasses.filter((c) => c.className === "block-cards__content");

    // block-cards should point to the ".block-cards {" line (0-indexed)
    expect(blockCardsDefs).toHaveLength(1);
    expect(blockCardsDefs[0].line).toBe(blockCardsLine);

    // block-cards__content should have 2 definitions:
    // one from &__content and one from .block-cards__content
    expect(blockCardsContentDefs).toHaveLength(2);

    // One should point to &__content line, other to .block-cards__content line
    const defLines = blockCardsContentDefs.map((d) => d.line).sort((a, b) => a - b);
    expect(defLines[0]).toBe(contentLine);
    expect(defLines[1]).toBe(fullContentLine);
  });
});
