import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// Shim require() for ESM bundles — needed because vscode-languageclient
// and vscode-languageserver internally use require() for Node built-ins.
const esmBanner = `import{createRequire as __cr}from"module";const require=__cr(import.meta.url);`;

// ─── WASM file copy (tree-sitter) ────────────────────────────────────────────
// When tree-sitter is enabled, the server loads .wasm grammars at runtime.
// Copy them into dist/ so they're available after bundling.
const wasmFiles = [
	[
		"node_modules/web-tree-sitter/web-tree-sitter.wasm",
		"dist/web-tree-sitter.wasm",
	],
	[
		"node_modules/tree-sitter-css/tree-sitter-css.wasm",
		"dist/tree-sitter-css.wasm",
	],
	[
		"node_modules/tree-sitter-html/tree-sitter-html.wasm",
		"dist/tree-sitter-html.wasm",
	],
	[
		"node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm",
		"dist/tree-sitter-javascript.wasm",
	],
	[
		"node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm",
		"dist/tree-sitter-tsx.wasm",
	],
];

function copyWasmFiles() {
	fs.mkdirSync("dist", { recursive: true });
	for (const [src, dest] of wasmFiles) {
		try {
			fs.copyFileSync(src, dest);
		} catch {
			console.warn(`[esbuild] Warning: Could not copy ${src} → ${dest}`);
		}
	}
	console.log("[esbuild] WASM grammar files copied to dist/");
}

/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	banner: { js: esmBanner },
	sourcemap: !production,
	minify: production,
	sourcesContent: false,
};

// Extension client — runs inside the VS Code extension host
/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
	...sharedOptions,
	entryPoints: ["src/extension.ts"],
	outfile: "dist/extension.js",
	external: ["vscode"],
};

// Language server — spawned as a child process by the client
/** @type {import('esbuild').BuildOptions} */
const serverOptions = {
	...sharedOptions,
	entryPoints: ["src/server.ts"],
	outfile: "dist/server.js",
};

async function main() {
	copyWasmFiles();

	if (watch) {
		const [extCtx, srvCtx] = await Promise.all([
			esbuild.context(extensionOptions),
			esbuild.context(serverOptions),
		]);
		await Promise.all([extCtx.watch(), srvCtx.watch()]);
		console.log("[esbuild] watching for changes…");
	} else {
		await Promise.all([
			esbuild.build(extensionOptions),
			esbuild.build(serverOptions),
		]);
		console.log("[esbuild] build complete");
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
