/**
 * Represents a single CSS class definition found in a stylesheet.
 */
export interface CssClassDefinition {
  /** The full class name (e.g. "block__element--modifier") */
  className: string;
  /** Absolute file path where the class is defined */
  filePath: string;
  /** Zero-based line number */
  line: number;
  /** Zero-based column offset */
  column: number;
  /** End line (zero-based) */
  endLine: number;
  /** End column (zero-based) */
  endColumn: number;
  /** The raw selector text that produced this class */
  rawSelector: string;
  /** Whether this class was produced by SCSS nesting resolution */
  nested: boolean;
  /** Whether this class matches a BEM pattern */
  bem: BemParts | null;
}

export interface BemParts {
  block: string;
  element: string | null;
  modifier: string | null;
}

/**
 * Represents a class name reference found in a template file (HTML/Vue/React).
 */
export interface CssClassReference {
  /** The class name string */
  className: string;
  /** Absolute file path */
  filePath: string;
  /** Zero-based line */
  line: number;
  /** Zero-based column of the class name start */
  column: number;
  /** Zero-based end column */
  endColumn: number;
}

/**
 * Configuration for the CSS Classes LSP.
 */
export interface CssClassesConfig {
  /** Glob patterns for CSS/SCSS files to index. */
  includePatterns: string[];

  /** Glob patterns to exclude from indexing. */
  excludePatterns: string[];

  /**
   * Which template languages to enable parsing for.
   * @default { html: true, vue: true, react: true }
   */
  languages: {
    html: boolean;
    vue: boolean;
    react: boolean;
  };

  /**
   * File extensions to treat as each language type.
   */
  extensions: {
    html: string[];
    vue: string[];
    react: string[];
    css: string[];
  };

  /**
   * Enable BEM pattern awareness.
   * @default true
   */
  bemEnabled: boolean;

  /**
   * BEM separators.
   * @default { element: "__", modifier: "--" }
   */
  bemSeparators: {
    element: string;
    modifier: string;
  };

  /**
   * Enable SCSS nesting resolution.
   * @default true
   */
  scssNesting: boolean;

  /**
   * Search in <style> blocks of .vue and framework files.
   * @default true
   */
  searchEmbeddedStyles: boolean;

  /**
   * Respect .gitignore when scanning for files.
   * When enabled, files matching patterns in .gitignore will be excluded.
   * @default false
   */
  respectGitignore: boolean;
}

export const DEFAULT_CONFIG: CssClassesConfig = {
  includePatterns: ["**/*.css", "**/*.scss"],
  excludePatterns: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
  languages: {
    html: true,
    vue: true,
    react: true,
  },
  extensions: {
    html: [".html", ".htm"],
    vue: [".vue"],
    react: [".jsx", ".tsx"],
    css: [".css", ".scss"],
  },
  bemEnabled: true,
  bemSeparators: {
    element: "__",
    modifier: "--",
  },
  scssNesting: true,
  searchEmbeddedStyles: true,
  respectGitignore: true,
};
