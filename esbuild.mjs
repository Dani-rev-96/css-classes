import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
	bundle: true,
	platform: "node",
	target: "node20",
	format: "cjs",
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
