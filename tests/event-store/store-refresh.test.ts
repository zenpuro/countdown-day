import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from '../mocks/obsidian';
import { EventStore } from '../../src/event-store/event-store';

/**
 * Regression tests for the startup race (issue: Countdowns had files but the
 * view stayed empty): plugin onload runs BEFORE metadataCache resolves
 * frontmatter, so the first full scan sees nothing. The store must re-scan
 * on metadataCache 'resolved' — and its notify must be diff-gated so the
 * extra resolution batches never spam the view with re-renders.
 */

interface FakeFile {
	path: string;
	frontmatter: unknown;
}

function makeStore(files: FakeFile[]) {
	let cacheReady = false;
	const byPath = new Map(files.map((f) => [f.path, f]));
	const listeners = new Map<string, (file?: unknown) => void>();
	const app = {
		vault: {
			getMarkdownFiles: () => [] as TFile[],
			getFolderByPath: (folder: string) => ({
				children: [...byPath.keys()]
					.filter((p) => p.startsWith(`${folder}/`))
					.map((p) => Object.assign(new TFile(), { path: p })),
			}),
			on: (name: string, handler: (file?: unknown) => void) => {
				listeners.set(`vault:${name}`, handler);
				return { off: () => {} };
			},
		},
		metadataCache: {
			getFileCache: (file: { path: string }) =>
				cacheReady ? { frontmatter: byPath.get(file.path)?.frontmatter ?? null } : null,
			on: (name: string, handler: (file?: unknown) => void) => {
				listeners.set(name, handler);
				return { off: () => {} };
			},
		},
	};
	const registered: unknown[] = [];
	const plugin = { registerEvent: (event: unknown) => registered.push(event) };
	let folder = 'Countdowns';
	const store = new EventStore(app as never, () => folder);
	return {
		store,
		plugin,
		registered,
		setFolder(next: string): void {
			folder = next;
		},
		setCacheReady(ready: boolean): void {
			cacheReady = ready;
		},
		fireResolved(): void {
			listeners.get('resolved')?.();
		},
	};
}

const EVENT_FM = { type: 'countdown', date: '2030-01-01' };

afterEach(() => vi.restoreAllMocks());

describe('EventStore.refresh — startup race', () => {
	it('sees nothing while the cache is cold, then picks events up on resolved', async () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const env = makeStore([
			{ path: 'Countdowns/1.md', frontmatter: EVENT_FM },
			{ path: 'Countdowns/2.md', frontmatter: EVENT_FM },
		]);
		env.store.register(env.plugin as never);

		// plugin onload: cache not resolved yet → empty (the reported bug)
		await env.store.refresh();
		expect(env.store.getEvents()).toHaveLength(0);
		expect(env.registered).toHaveLength(5); // resolved + changed + rename + delete + create

		// metadataCache finishes resolving → re-scan finds both files
		env.setCacheReady(true);
		env.fireResolved();
		await vi.waitFor(() => expect(env.store.getEvents()).toHaveLength(2));
		expect(spy).not.toHaveBeenCalled();
	});

	it('skips frontmatter-less notes in the folder silently', async () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const env = makeStore([{ path: 'Countdowns/README.md', frontmatter: null }]);
		env.setCacheReady(true);
		await env.store.refresh();
		expect(env.store.getEvents()).toHaveLength(0);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('EventStore.refresh — diff-gated notify', () => {
	it('notifies once per actual change; identical re-scans stay silent', async () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const files: FakeFile[] = [{ path: 'Countdowns/1.md', frontmatter: { ...EVENT_FM } }];
		const env = makeStore(files);
		env.setCacheReady(true);
		await env.store.refresh();

		const listener = vi.fn();
		env.store.subscribe(listener);

		// identical snapshot → no notify
		await env.store.refresh();
		expect(listener).not.toHaveBeenCalled();

		// frontmatter changed → one notify
		files[0].frontmatter = { ...EVENT_FM, pinned: true };
		await env.store.refresh();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(env.store.getEvents()[0]?.pinned).toBe(true);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('EventStore.refresh — folder switch (settings change)', () => {
	it('notifies when the scanned folder changes even if snapshots are equal', async () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const env = makeStore([
			{ path: 'Countdowns/1.md', frontmatter: { ...EVENT_FM } },
			{ path: 'Other/1.md', frontmatter: { ...EVENT_FM } },
		]);
		env.setCacheReady(true);
		await env.store.refresh();
		const listener = vi.fn();
		env.store.subscribe(listener);

		// identical re-scan of the same folder → silent (existing contract)
		await env.store.refresh();
		expect(listener).not.toHaveBeenCalled();

		// settings switched the folder → notify even though both folders hold
		// an identical event shape; the view re-renders on any notification,
		// so scope switches must fire it (reported: view kept the old folder
		// until restart)
		env.setFolder('Other');
		await env.store.refresh();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(env.store.getEvents().map((e) => e.path)).toEqual(['Other/1.md']);
		expect(spy).not.toHaveBeenCalled();
	});

	it('re-scanning after a switch to an empty folder empties and notifies', async () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const env = makeStore([{ path: 'Countdowns/1.md', frontmatter: { ...EVENT_FM } }]);
		env.setCacheReady(true);
		await env.store.refresh();
		expect(env.store.getEvents()).toHaveLength(1);

		const listener = vi.fn();
		env.store.subscribe(listener);
		env.setFolder('Missing');
		await env.store.refresh();

		expect(listener).toHaveBeenCalledTimes(1);
		expect(env.store.getEvents()).toHaveLength(0);
		expect(spy).not.toHaveBeenCalled();
	});
});
