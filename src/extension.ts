import * as path from "path";
import * as vscode from "vscode";
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node.js";

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel;

export async function activate(ctx: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel("CSS Classes");
	ctx.subscriptions.push(outputChannel);

	const serverModule = ctx.asAbsolutePath(path.join("dist", "server.js"));
	outputChannel.appendLine(`Server module: ${serverModule}`);

	const serverOptions: ServerOptions = {
		run: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: { execArgv: ["--nolazy", "--inspect=6009"] },
		},
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: "file", language: "css" },
			{ scheme: "file", language: "scss" },
			{ scheme: "file", language: "typescriptreact" },
			{ scheme: "file", language: "javascriptreact" },
			{ scheme: "file", language: "html" },
			{ scheme: "file", language: "vue" },
		],
		outputChannel,
		initializationOptions: getSettings(),
		synchronize: {
			configurationSection: "cssClasses",
		},
	};

	client = new LanguageClient(
		"cssClassesLsp",
		"CSS Classes LSP",
		serverOptions,
		clientOptions,
	);

	ctx.subscriptions.push(client);
	await client.start();
	outputChannel.appendLine("CSS Classes LSP client started.");
}

/**
 * Read VS Code settings under the "cssClasses" namespace and return them
 * as a plain object for the server's initializationOptions.
 */
function getSettings(): Record<string, unknown> {
	const cfg = vscode.workspace.getConfiguration("cssClasses");
	return {
		includePatterns: cfg.get("includePatterns"),
		excludePatterns: cfg.get("excludePatterns"),
		languages: cfg.get("languages"),
		extensions: cfg.get("extensions"),
		bemEnabled: cfg.get("bemEnabled"),
		bemSeparators: cfg.get("bemSeparators"),
		scssNesting: cfg.get("scssNesting"),
		searchEmbeddedStyles: cfg.get("searchEmbeddedStyles"),
	};
}

export async function deactivate() {
	if (client) {
		await client.stop();
		client = undefined;
	}
}
