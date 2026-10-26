import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.test.ts'],
		// installs the obsidian runtime stubs (globals + HTMLElement methods)
		setupFiles: ['./tests/mocks/obsidian.ts'],
	},
	resolve: {
		alias: [
			// the obsidian package ships typings only — stub it for unit tests
			{ find: /^obsidian$/, replacement: path.resolve(here, 'tests/mocks/obsidian.ts') },
		],
	},
});
