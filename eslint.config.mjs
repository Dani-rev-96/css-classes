import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"test/fixtures/**",
			"lsp/**",
			"lua/**",
			"neovim/**",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"no-constant-condition": ["error", { checkLoops: false }],
		},
	},
);
