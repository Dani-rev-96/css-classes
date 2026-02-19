import type { CssClassesConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

/**
 * Merge user-provided configuration with defaults.
 * Handles partial updates gracefully.
 */
export function resolveConfig(
  userConfig?: Record<string, unknown>,
): CssClassesConfig {
  if (!userConfig) return { ...DEFAULT_CONFIG };

  return {
    includePatterns: asStringArray(
      userConfig.includePatterns,
      DEFAULT_CONFIG.includePatterns,
    ),
    excludePatterns: asStringArray(
      userConfig.excludePatterns,
      DEFAULT_CONFIG.excludePatterns,
    ),
    languages: {
      html: asBool(
        (userConfig.languages as Record<string, unknown>)?.html,
        DEFAULT_CONFIG.languages.html,
      ),
      vue: asBool(
        (userConfig.languages as Record<string, unknown>)?.vue,
        DEFAULT_CONFIG.languages.vue,
      ),
      react: asBool(
        (userConfig.languages as Record<string, unknown>)?.react,
        DEFAULT_CONFIG.languages.react,
      ),
    },
    extensions: {
      html: asStringArray(
        (userConfig.extensions as Record<string, unknown>)?.html,
        DEFAULT_CONFIG.extensions.html,
      ),
      vue: asStringArray(
        (userConfig.extensions as Record<string, unknown>)?.vue,
        DEFAULT_CONFIG.extensions.vue,
      ),
      react: asStringArray(
        (userConfig.extensions as Record<string, unknown>)?.react,
        DEFAULT_CONFIG.extensions.react,
      ),
      css: asStringArray(
        (userConfig.extensions as Record<string, unknown>)?.css,
        DEFAULT_CONFIG.extensions.css,
      ),
    },
    bemEnabled: asBool(userConfig.bemEnabled, DEFAULT_CONFIG.bemEnabled),
    bemSeparators: {
      element: asString(
        (userConfig.bemSeparators as Record<string, unknown>)?.element,
        DEFAULT_CONFIG.bemSeparators.element,
      ),
      modifier: asString(
        (userConfig.bemSeparators as Record<string, unknown>)?.modifier,
        DEFAULT_CONFIG.bemSeparators.modifier,
      ),
    },
    bemDefinitionParts: asBool(
      userConfig.bemDefinitionParts,
      DEFAULT_CONFIG.bemDefinitionParts,
    ),
    scssNesting: asBool(userConfig.scssNesting, DEFAULT_CONFIG.scssNesting),
    searchEmbeddedStyles: asBool(
      userConfig.searchEmbeddedStyles,
      DEFAULT_CONFIG.searchEmbeddedStyles,
    ),
    respectGitignore: asBool(
      userConfig.respectGitignore,
      DEFAULT_CONFIG.respectGitignore,
    ),
    experimentalTreeSitter: asBool(
      userConfig.experimentalTreeSitter,
      DEFAULT_CONFIG.experimentalTreeSitter,
    ),
  };
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  return fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
