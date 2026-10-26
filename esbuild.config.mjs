import esbuild from 'esbuild';
import process from 'node:process';
import builtins from 'builtin-modules';

const banner = `/*
Countdown Day — an Obsidian plugin for tracking countdowns and memorial days
(solar & lunar calendar). Built with esbuild; see repository for source.
*/
`;

const production = process.argv[2] === 'production';

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', '@codemirror/autocomplete', ...builtins],
	format: 'cjs',
	target: 'es2018',
	charset: 'utf8',
	logLevel: 'info',
	outfile: 'main.js',
	sourcemap: production ? false : 'inline',
	treeShaking: true,
	minify: production,
});

if (production) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
