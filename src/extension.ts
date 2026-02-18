import * as vscode from "vscode";
import * as path from "path";
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node.js";

let client: LanguageClient | undefined;

export async function activate(ctx: vscode.ExtensionContext) {
	const cfg = vscode.workspace.getConfiguration("devLsp");
	const serverPath = cfg.get<string>("serverPath");

	if (!serverPath) {
		vscode.window.showWarningMessage("devLsp.serverPath is not set.");
		return;
	}

	const serverOptions: ServerOptions = {
		run: {
			command: "node",
			args: [serverPath, "--stdio"],
			transport: TransportKind.stdio,
		},
		debug: {
			command: "node",
			args: ["--inspect=6009", serverPath, "--stdio"],
			transport: TransportKind.stdio,
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
		// wichtig falls Monorepo: root an Workspace binden
		workspaceFolder: vscode.workspace.workspaceFolders?.[0],
	};

	client = new LanguageClient(
		"devLspClient",
		"Dev LSP Client",
		serverOptions,
		clientOptions,
	);
	client.start();
	ctx.subscriptions.push(client);
}

export async function deactivate() {
	await client?.stop();
}
