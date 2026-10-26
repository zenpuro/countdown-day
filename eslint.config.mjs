// Mirrors the automated review run by the Obsidian community directory
// (community.obsidian.md). Keep zero errors before every release.
import obsidianPlugin from 'eslint-plugin-obsidianmd';

export default [
	...obsidianPlugin.configs.recommended,
	{
		// local tooling & build artifacts, not plugin source
		ignores: ['.agents/**', 'main.js', 'node_modules/**'],
	},
	{
		// not part of any tsconfig project; nothing reviewable in there
		ignores: ['vitest.config.ts'],
	},
	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// Node-side build tooling: Obsidian runtime rules don't apply
		files: ['scripts/**'],
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/rule-custom-message': 'off',
			'obsidianmd/regex-lookbehind': 'off',
			'no-empty': 'off',
			'no-useless-escape': 'off',
			'no-unsanitized/property': 'off',
			'obsidianmd/no-forbidden-elements': 'off',
		},
	},
	{
		// tests run in Node, not the Obsidian app: node builtins & globals are fine
		files: ['tests/**/*.ts', '*.config.ts'],
		languageOptions: {
			globals: {
				process: 'readonly',
				require: 'readonly',
			},
		},
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
];
