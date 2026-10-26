import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Scaffold acceptance (Task 1): manifest.json must identify the plugin as
 * `countdown-day` and stay available on mobile (isDesktopOnly: false).
 */
describe('plugin manifest', () => {
	it('declares id "countdown-day" and isDesktopOnly false', () => {
		const manifest = JSON.parse(
			readFileSync(join(process.cwd(), 'manifest.json'), 'utf-8'),
		);

		expect(manifest.id).toBe('countdown-day');
		expect(manifest.isDesktopOnly).toBe(false);
	});
});
