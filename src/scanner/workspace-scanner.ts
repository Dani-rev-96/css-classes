import * as fs from "node:fs";
import * as path from "node:path";
import fg from "fast-glob";
import type { CssClassesConfig } from "../types.js";

/**
 * Read .gitignore from the workspace root and convert patterns to glob ignore patterns.
 */
function readGitignorePatterns(workspaceRoot: string): string[] {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"))
      .flatMap((pattern) => {
        const clean = pattern.replace(/\/$/, "");
        if (clean.startsWith("/")) {
          // Rooted pattern — relative to workspace root
          return [clean.slice(1), clean.slice(1) + "/**"];
        }
        // Non-rooted — can match in any subdirectory
        return ["**/" + clean, "**/" + clean + "/**"];
      });
  } catch {
    return [];
  }
}

/**
 * Scan the workspace for CSS/SCSS files matching the configured patterns.
 */
export async function scanWorkspace(
  workspaceRoot: string,
  config: CssClassesConfig,
): Promise<string[]> {
  const patterns = config.includePatterns;
  const ignore = [
    ...config.excludePatterns,
    ...(config.respectGitignore ? readGitignorePatterns(workspaceRoot) : []),
  ];

  const files = await fg(patterns, {
    cwd: workspaceRoot,
    ignore,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  return files;
}

/**
 * Scan for template files (HTML, Vue, React) in the workspace.
 */
export async function scanTemplateFiles(
  workspaceRoot: string,
  config: CssClassesConfig,
): Promise<string[]> {
  const extensions: string[] = [];

  if (config.languages.html) extensions.push(...config.extensions.html);
  if (config.languages.vue) extensions.push(...config.extensions.vue);
  if (config.languages.react) extensions.push(...config.extensions.react);

  if (extensions.length === 0) return [];

  const pattern = `**/*{${extensions.join(",")}}`;
  const ignore = [
    ...config.excludePatterns,
    ...(config.respectGitignore ? readGitignorePatterns(workspaceRoot) : []),
  ];

  const files = await fg(pattern, {
    cwd: workspaceRoot,
    ignore,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  return files;
}

/**
 * Read a file and return its contents, or null if it doesn't exist.
 */
export async function readFileContent(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Determine the language type of a file by its extension.
 */
export function getFileLanguage(
  filePath: string,
  config: CssClassesConfig,
): "css" | "html" | "vue" | "react" | null {
  const ext = path.extname(filePath).toLowerCase();

  if (config.extensions.css.includes(ext)) return "css";
  if (config.extensions.html.includes(ext)) return "html";
  if (config.extensions.vue.includes(ext)) return "vue";
  if (config.extensions.react.includes(ext)) return "react";

  return null;
}
