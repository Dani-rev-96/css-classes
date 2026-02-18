import type { BemParts } from "../types.js";

/**
 * Parse a class name into BEM parts.
 */
export function parseBem(
  className: string,
  elementSep = "__",
  modifierSep = "--",
): BemParts | null {
  // Must start with a valid block name
  if (!className || className.startsWith(elementSep) || className.startsWith(modifierSep)) {
    return null;
  }

  let block: string;
  let element: string | null = null;
  let modifier: string | null = null;

  const elemIdx = className.indexOf(elementSep);
  const modIdx = className.indexOf(modifierSep);

  if (elemIdx === -1 && modIdx === -1) {
    // Plain block
    return { block: className, element: null, modifier: null };
  }

  if (elemIdx !== -1 && (modIdx === -1 || elemIdx < modIdx)) {
    // Has element
    block = className.slice(0, elemIdx);
    const rest = className.slice(elemIdx + elementSep.length);
    const restModIdx = rest.indexOf(modifierSep);
    if (restModIdx !== -1) {
      element = rest.slice(0, restModIdx);
      modifier = rest.slice(restModIdx + modifierSep.length);
    } else {
      element = rest;
    }
  } else {
    // Block with modifier, no element
    block = className.slice(0, modIdx);
    modifier = className.slice(modIdx + modifierSep.length);
  }

  if (!block) return null;

  return { block, element: element || null, modifier: modifier || null };
}

/**
 * Check if a class name matches BEM conventions.
 */
export function isBem(
  className: string,
  elementSep = "__",
  modifierSep = "--",
): boolean {
  const parts = parseBem(className, elementSep, modifierSep);
  return parts !== null && (parts.element !== null || parts.modifier !== null);
}

/**
 * Given a BEM class name, return its parent relationships.
 * E.g. "card__title--active" -> ["card", "card__title"]
 */
export function bemParents(
  className: string,
  elementSep = "__",
  modifierSep = "--",
): string[] {
  const parts = parseBem(className, elementSep, modifierSep);
  if (!parts) return [];

  const parents: string[] = [];
  if (parts.modifier && parts.element) {
    parents.push(parts.block);
    parents.push(`${parts.block}${elementSep}${parts.element}`);
  } else if (parts.modifier) {
    parents.push(parts.block);
  } else if (parts.element) {
    parents.push(parts.block);
  }
  return parents;
}

/**
 * Determine which BEM part the cursor is on within a class name and return the
 * class name that should be looked up for go-to-definition.
 *
 * Given `card__header--active` (length 21) with separators `__` and `--`:
 *   offset 0-3 ("card")          → "card"           (block)
 *   offset 4-11 ("__header")     → "card__header"   (element)
 *   offset 12-20 ("--active")    → "card__header--active" (modifier / full)
 *
 * If the class has no BEM structure, the full class name is returned.
 *
 * @param className  The full BEM class name string
 * @param offset     Zero-based cursor offset within the class name
 * @param elementSep Element separator (default "__")
 * @param modifierSep Modifier separator (default "--")
 * @returns The target class name to look up
 */
export function bemTargetAtOffset(
  className: string,
  offset: number,
  elementSep = "__",
  modifierSep = "--",
): string {
  const parts = parseBem(className, elementSep, modifierSep);
  if (!parts) return className;

  // No BEM structure → return as-is
  if (!parts.element && !parts.modifier) return className;

  const blockEnd = parts.block.length;

  // Determine where the element separator+element ends
  let elementEnd = blockEnd;
  if (parts.element) {
    elementEnd = blockEnd + elementSep.length + parts.element.length;
  }

  // Cursor within the block portion
  if (offset < blockEnd) {
    return parts.block;
  }

  // Cursor within the element separator or element name
  if (parts.element && offset < elementEnd) {
    return `${parts.block}${elementSep}${parts.element}`;
  }

  // Cursor is on the modifier separator or modifier — return full class name
  return className;
}
