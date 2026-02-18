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
