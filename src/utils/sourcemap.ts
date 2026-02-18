import * as fs from "node:fs";
import * as path from "node:path";
import type { SourceMapMapping } from "../types.js";

/**
 * Parsed source map (V3 format).
 */
export interface SourceMap {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  mappings: string;
}

/**
 * A decoded mapping segment.
 */
interface DecodedSegment {
  /** Generated column (zero-based) */
  generatedColumn: number;
  /** Source index in the sources array */
  sourceIndex: number;
  /** Original line (zero-based) */
  originalLine: number;
  /** Original column (zero-based) */
  originalColumn: number;
  /** Name index (optional) */
  nameIndex?: number;
}

/**
 * Decoded mappings organized by generated line.
 */
type DecodedMappings = DecodedSegment[][];

// VLQ character set
const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VLQ_LOOKUP = new Map<string, number>();
for (let i = 0; i < VLQ_CHARS.length; i++) {
  VLQ_LOOKUP.set(VLQ_CHARS[i], i);
}

const VLQ_CONTINUATION_BIT = 0x20;
const VLQ_SHIFT = 5;

/**
 * Decode a single VLQ value from a mappings string.
 * Returns the decoded integer and the new position.
 */
function decodeVlq(mappings: string, pos: number): [value: number, newPos: number] {
  let result = 0;
  let shift = 0;

  while (pos < mappings.length) {
    const ch = mappings[pos];
    const digit = VLQ_LOOKUP.get(ch);
    if (digit === undefined) {
      throw new Error(`Invalid VLQ character: ${ch}`);
    }
    pos++;

    result |= (digit & 0x1f) << shift;
    shift += VLQ_SHIFT;

    if ((digit & VLQ_CONTINUATION_BIT) === 0) {
      break;
    }
  }

  // Convert from sign-encoded to two's complement
  const isNegative = (result & 1) !== 0;
  result >>= 1;
  if (isNegative) result = -result;

  return [result, pos];
}

/**
 * Decode a V3 source map mappings string into structured segments.
 */
function decodeMappings(mappings: string): DecodedMappings {
  const lines: DecodedMappings = [];
  let currentLine: DecodedSegment[] = [];

  // Running state (VLQ values are relative)
  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;

  let pos = 0;

  while (pos <= mappings.length) {
    if (pos === mappings.length || mappings[pos] === ";") {
      lines.push(currentLine);
      currentLine = [];
      generatedColumn = 0;
      pos++;
      continue;
    }

    if (mappings[pos] === ",") {
      pos++;
      continue;
    }

    // Decode segment fields
    const segment: DecodedSegment = {
      generatedColumn: 0,
      sourceIndex: 0,
      originalLine: 0,
      originalColumn: 0,
    };

    // Field 1: generated column (always present)
    let value: number;
    [value, pos] = decodeVlq(mappings, pos);
    generatedColumn += value;
    segment.generatedColumn = generatedColumn;

    // Check if there are more fields
    if (pos < mappings.length && mappings[pos] !== "," && mappings[pos] !== ";") {
      // Field 2: source index
      [value, pos] = decodeVlq(mappings, pos);
      sourceIndex += value;
      segment.sourceIndex = sourceIndex;

      // Field 3: original line
      [value, pos] = decodeVlq(mappings, pos);
      originalLine += value;
      segment.originalLine = originalLine;

      // Field 4: original column
      [value, pos] = decodeVlq(mappings, pos);
      originalColumn += value;
      segment.originalColumn = originalColumn;

      // Field 5: name index (optional)
      if (pos < mappings.length && mappings[pos] !== "," && mappings[pos] !== ";") {
        [value, pos] = decodeVlq(mappings, pos);
        nameIndex += value;
        segment.nameIndex = nameIndex;
      }

      currentLine.push(segment);
    }
  }

  return lines;
}

/**
 * Parse a source map JSON string into a SourceMap object.
 */
export function parseSourceMap(content: string): SourceMap | null {
  try {
    const raw = JSON.parse(content);
    if (raw.version !== 3) return null;
    return {
      version: raw.version,
      file: raw.file,
      sourceRoot: raw.sourceRoot,
      sources: raw.sources ?? [],
      sourcesContent: raw.sourcesContent,
      mappings: raw.mappings ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a generated position back to the original source position.
 *
 * @param map - The parsed source map
 * @param generatedLine - Zero-based generated line
 * @param generatedColumn - Zero-based generated column
 * @param mapFilePath - Absolute path to the source map file (for resolving relative source paths)
 * @returns The resolved original position, or null if no mapping found
 */
export function resolveOriginalPosition(
  map: SourceMap,
  generatedLine: number,
  generatedColumn: number,
  mapFilePath: string,
): SourceMapMapping | null {
  const decoded = decodeMappings(map.mappings);

  if (generatedLine >= decoded.length) return null;

  const lineSegments = decoded[generatedLine];
  if (lineSegments.length === 0) return null;

  // Binary search for the segment closest to (but not after) the generated column
  let bestSegment: DecodedSegment | null = null;

  for (const segment of lineSegments) {
    if (segment.generatedColumn <= generatedColumn) {
      bestSegment = segment;
    } else {
      break; // segments are sorted by generated column
    }
  }

  if (!bestSegment) {
    // Use the first segment on this line as fallback
    bestSegment = lineSegments[0];
  }

  if (bestSegment.sourceIndex >= map.sources.length) return null;

  const sourceRoot = map.sourceRoot ?? "";
  const sourcePath = map.sources[bestSegment.sourceIndex];
  const mapDir = path.dirname(mapFilePath);
  const resolvedPath = path.resolve(mapDir, sourceRoot, sourcePath);

  return {
    originalFilePath: resolvedPath,
    originalLine: bestSegment.originalLine,
    originalColumn: bestSegment.originalColumn,
  };
}

/**
 * Find the source map associated with a CSS file.
 *
 * Checks for:
 *  1. Inline sourceMappingURL (data: URI)
 *  2. External sourceMappingURL comment referencing a .map file
 *  3. A .map file with the same name adjacent to the CSS file
 */
export async function findSourceMap(
  cssFilePath: string,
  cssContent: string,
): Promise<{ map: SourceMap; mapFilePath: string } | null> {
  // Check for sourceMappingURL comment
  const urlMatch = cssContent.match(
    /\/\*[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)\s*\*\//,
  );

  if (urlMatch) {
    const url = urlMatch[1];

    // Inline data URI
    if (url.startsWith("data:")) {
      const base64Match = url.match(
        /^data:[^;]*;base64,(.+)$/,
      );
      if (base64Match) {
        const decoded = Buffer.from(base64Match[1], "base64").toString("utf-8");
        const map = parseSourceMap(decoded);
        if (map) {
          return { map, mapFilePath: cssFilePath };
        }
      }
      return null;
    }

    // External file reference
    const mapPath = path.resolve(path.dirname(cssFilePath), url);
    try {
      const mapContent = await fs.promises.readFile(mapPath, "utf-8");
      const map = parseSourceMap(mapContent);
      if (map) {
        return { map, mapFilePath: mapPath };
      }
    } catch {
      // File not found
    }
    return null;
  }

  // Fallback: check for .map file with same name
  const mapPath = cssFilePath + ".map";
  try {
    const mapContent = await fs.promises.readFile(mapPath, "utf-8");
    const map = parseSourceMap(mapContent);
    if (map) {
      return { map, mapFilePath: mapPath };
    }
  } catch {
    // No map file found
  }

  return null;
}
