#!/usr/bin/env node

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DefinitionParams,
  HoverParams,
  CompletionParams,
  CompletionItem as LSPCompletionItem,
  CompletionItemKind,
  DidChangeConfigurationParams,
  DidChangeWatchedFilesNotification,
  MarkupKind,
  Location,
  Range,
  Position,
  DidChangeWatchedFilesParams,
  FileChangeType,
  ReferenceParams,
  WorkspaceSymbolParams,
  SymbolInformation,
  SymbolKind,
  DiagnosticSeverity,
  Diagnostic as LSPDiagnostic,
} from "vscode-languageserver/node.js";

import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";

import { CssClassIndex } from "./core/css-index.js";
import { getDefinition } from "./core/definition.js";
import { getHover } from "./core/hover.js";
import { getCompletions } from "./core/completion.js";
import { getReferences } from "./core/references.js";
import { getDiagnostics } from "./core/diagnostics.js";
import { getWorkspaceSymbols } from "./core/workspace-symbols.js";
import { resolveConfig } from "./config.js";
import type { CssClassesConfig, CssClassReference } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { getFileLanguage } from "./scanner/workspace-scanner.js";
import { extractStyleBlocks } from "./parsers/css-parser.js";
import { parseHtmlClasses } from "./parsers/html-parser.js";
import { parseVueClasses } from "./parsers/vue-parser.js";
import { parseReactClasses } from "./parsers/react-parser.js";

// Create connection and document manager
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let config: CssClassesConfig = DEFAULT_CONFIG;
let classIndex: CssClassIndex;
let workspaceRoot: string | null = null;
let indexReady = false;

// ─── Initialization ──────────────────────────────────────────────────────────

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Determine workspace root
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    workspaceRoot = URI.parse(params.workspaceFolders[0].uri).fsPath;
  } else if (params.rootUri) {
    workspaceRoot = URI.parse(params.rootUri).fsPath;
  } else if (params.rootPath) {
    workspaceRoot = params.rootPath;
  }

  // Resolve initial configuration
  const initOptions = params.initializationOptions as Record<string, unknown> | undefined;
  config = resolveConfig(initOptions);
  classIndex = new CssClassIndex(config);

  connection.console.log(
    `[css-classes-lsp] Initialized. Workspace: ${workspaceRoot ?? "(none)"}`,
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      hoverProvider: true,
      referencesProvider: true,
      completionProvider: {
        triggerCharacters: ['"', "'", " ", ".", "-", "_"],
        resolveProvider: false,
      },
      workspaceSymbolProvider: true,
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
    },
  };
});

connection.onInitialized(async () => {
  // Register for file watching (CSS/SCSS files)
  connection.client.register(
    DidChangeWatchedFilesNotification.type,
    {
      watchers: [
        { globPattern: "**/*.css" },
        { globPattern: "**/*.scss" },
      ],
    },
  ).catch(() => {
    // File watching registration may not be supported by all clients
    connection.console.log("[css-classes-lsp] File watching registration failed, using document sync only.");
  });

  // Initial indexing
  if (workspaceRoot) {
    try {
      connection.console.log("[css-classes-lsp] Starting workspace indexing...");
      await classIndex.indexWorkspace(workspaceRoot);
      indexReady = true;
      connection.console.log(
        `[css-classes-lsp] Indexed ${classIndex.size} unique classes (${classIndex.totalDefinitions} definitions)`,
      );
    } catch (err) {
      connection.console.error(`[css-classes-lsp] Indexing error: ${err}`);
    }
  }
});

// ─── Configuration ───────────────────────────────────────────────────────────

connection.onDidChangeConfiguration(async (change: DidChangeConfigurationParams) => {
  const settings = change.settings as Record<string, unknown> | undefined;
  const cssClassesSettings = (settings?.cssClasses ?? settings?.["css-classes"]) as
    | Record<string, unknown>
    | undefined;

  if (cssClassesSettings) {
    config = resolveConfig(cssClassesSettings);
    classIndex.updateConfig(config);

    // Re-index with new config
    if (workspaceRoot) {
      connection.console.log("[css-classes-lsp] Config changed, re-indexing...");
      await classIndex.indexWorkspace(workspaceRoot);
      connection.console.log(
        `[css-classes-lsp] Re-indexed: ${classIndex.size} classes`,
      );
    }
  }
});

// ─── File Events ─────────────────────────────────────────────────────────────

connection.onDidChangeWatchedFiles(async (params: DidChangeWatchedFilesParams) => {
  for (const change of params.changes) {
    const filePath = URI.parse(change.uri).fsPath;

    if (change.type === FileChangeType.Deleted) {
      classIndex.removeFile(filePath);
    } else {
      // Created or Changed
      await classIndex.indexFile(filePath);
    }
  }
});

// Re-index when documents are saved (covers embedded styles in Vue files etc.)
documents.onDidSave(async (event) => {
  const filePath = URI.parse(event.document.uri).fsPath;
  const lang = getFileLanguage(filePath, config);

  if (lang === "css") {
    await classIndex.indexFile(filePath, event.document.getText());
  } else if (lang === "vue" || lang === "html") {
    if (config.searchEmbeddedStyles) {
      classIndex.removeFile(filePath);
      classIndex.indexEmbeddedStyles(filePath, event.document.getText());
    }
  }

  // Publish diagnostics after re-indexing
  publishDiagnostics(event.document);
});

// ─── Go to Definition ────────────────────────────────────────────────────────

connection.onDefinition((params: DefinitionParams): Location[] | null => {
  if (!indexReady) return null;

  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const filePath = URI.parse(doc.uri).fsPath;
  const content = doc.getText();

  const result = getDefinition(
    content,
    filePath,
    params.position.line,
    params.position.character,
    classIndex,
    config,
  );

  if (!result) return null;

  return result.definitions.map((def) => ({
    uri: URI.file(def.filePath).toString(),
    range: Range.create(
      Position.create(def.line, def.column),
      Position.create(def.endLine, def.endColumn),
    ),
  }));
});

// ─── Hover ───────────────────────────────────────────────────────────────────

connection.onHover((params: HoverParams) => {
  if (!indexReady) return null;

  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const filePath = URI.parse(doc.uri).fsPath;
  const content = doc.getText();

  // Get the class name at cursor
  const defResult = getDefinition(
    content,
    filePath,
    params.position.line,
    params.position.character,
    classIndex,
    config,
  );

  if (!defResult) return null;

  const hoverResult = getHover(defResult.className, classIndex, config);
  if (!hoverResult) return null;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hoverResult.contents,
    },
  };
});

// ─── Completion ──────────────────────────────────────────────────────────────

connection.onCompletion((params: CompletionParams): LSPCompletionItem[] => {
  if (!indexReady) return [];

  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  // Get the text before the cursor to determine the prefix
  const line = doc.getText({
    start: Position.create(params.position.line, 0),
    end: params.position,
  });

  // Check if we're in a class context
  const classContext = detectClassContext(line);
  if (!classContext) return [];

  const items = getCompletions(classContext.prefix, classIndex);

  return items.map((item, idx) => ({
    label: item.label,
    kind: CompletionItemKind.Value,
    detail: item.detail,
    documentation: item.documentation
      ? { kind: MarkupKind.PlainText, value: item.documentation }
      : undefined,
    sortText: String(idx).padStart(5, "0"),
  }));
});

// ─── References ──────────────────────────────────────────────────────────────

connection.onReferences(async (params: ReferenceParams): Promise<Location[] | null> => {
  if (!indexReady || !workspaceRoot) return null;

  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const filePath = URI.parse(doc.uri).fsPath;
  const content = doc.getText();

  // Resolve the class name at the cursor
  const defResult = getDefinition(
    content,
    filePath,
    params.position.line,
    params.position.character,
    classIndex,
    config,
  );

  if (!defResult) return null;

  // Build a map of open document contents for freshness
  const openDocuments = new Map<string, string>();
  for (const d of documents.all()) {
    openDocuments.set(URI.parse(d.uri).fsPath, d.getText());
  }

  const result = await getReferences(
    defResult.className,
    workspaceRoot,
    config,
    openDocuments,
    classIndex,
  );

  if (result.references.length === 0) return null;

  return result.references.map((ref) => ({
    uri: URI.file(ref.filePath).toString(),
    range: Range.create(
      Position.create(ref.line, ref.column),
      Position.create(ref.line, ref.endColumn),
    ),
  }));
});

// ─── Workspace Symbols ───────────────────────────────────────────────────────

connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
  if (!indexReady) return [];

  const symbols = getWorkspaceSymbols(params.query, classIndex);

  return symbols.map((sym) => ({
    name: sym.name,
    kind: SymbolKind.Class,
    location: {
      uri: URI.file(sym.filePath).toString(),
      range: Range.create(
        Position.create(sym.line, sym.column),
        Position.create(sym.line, sym.column + sym.name.length),
      ),
    },
    containerName: sym.containerName,
  }));
});

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Publish diagnostics for a template document (warn on undefined classes).
 */
async function publishDiagnostics(doc: TextDocument): Promise<void> {
  if (!indexReady) return;

  const filePath = URI.parse(doc.uri).fsPath;
  const lang = getFileLanguage(filePath, config);
  if (!lang || lang === "css") return;

  const content = doc.getText();
  let refs: CssClassReference[] = [];

  switch (lang) {
    case "html":
      refs = parseHtmlClasses(content, filePath);
      break;
    case "vue":
      refs = parseVueClasses(content, filePath);
      break;
    case "react":
      refs = parseReactClasses(content, filePath);
      break;
  }

  const diags = getDiagnostics(refs, classIndex, config);
  const lspDiags: LSPDiagnostic[] = diags.map((d) => ({
    range: Range.create(
      Position.create(d.line, d.column),
      Position.create(d.line, d.endColumn),
    ),
    severity: d.severity === "error"
      ? DiagnosticSeverity.Error
      : d.severity === "warning"
        ? DiagnosticSeverity.Warning
        : DiagnosticSeverity.Information,
    code: d.code,
    source: "css-classes",
    message: d.message,
  }));

  connection.sendDiagnostics({ uri: doc.uri, diagnostics: lspDiags });
}

// Publish diagnostics on document open
documents.onDidOpen((event) => {
  publishDiagnostics(event.document);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ClassContext {
  prefix: string;
}

/**
 * Detect if the cursor is inside a CSS class context and extract the current prefix.
 */
function detectClassContext(lineBeforeCursor: string): ClassContext | null {
  // HTML: class="foo ba|"
  const htmlMatch = lineBeforeCursor.match(/\bclass\s*=\s*["']([^"']*)$/i);
  if (htmlMatch) {
    const value = htmlMatch[1];
    const lastSpace = value.lastIndexOf(" ");
    return { prefix: lastSpace >= 0 ? value.slice(lastSpace + 1) : value };
  }

  // React: className="foo ba|" or className={'foo ba|'}
  const reactMatch = lineBeforeCursor.match(/\bclassName\s*=\s*[{"']([^}"']*)$/i);
  if (reactMatch) {
    const value = reactMatch[1];
    const lastSpace = value.lastIndexOf(" ");
    return { prefix: lastSpace >= 0 ? value.slice(lastSpace + 1) : value };
  }

  // Vue dynamic: :class="{ 'foo-|" or :class="['foo-|"
  const vueMatch = lineBeforeCursor.match(/(?::class|v-bind:class)\s*=\s*"[^"]*['"]([^'"]*$)/i);
  if (vueMatch) {
    return { prefix: vueMatch[1] };
  }

  // Utility functions: clsx('foo-|
  const utilMatch = lineBeforeCursor.match(/\b(?:clsx|classNames|classnames|cn|cx)\s*\([^)]*['"]([^'"]*$)/i);
  if (utilMatch) {
    return { prefix: utilMatch[1] };
  }

  // CSS Modules: styles['foo-|  or styles.foo|
  const modulesBracketMatch = lineBeforeCursor.match(/\bstyles\[['"]([^'"]*$)/i);
  if (modulesBracketMatch) {
    return { prefix: modulesBracketMatch[1] };
  }
  const modulesDotMatch = lineBeforeCursor.match(/\bstyles\.(\w*$)/i);
  if (modulesDotMatch) {
    return { prefix: modulesDotMatch[1] };
  }

  return null;
}

// ─── Start Server ────────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();
