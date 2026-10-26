import { App, Plugin, TFile, TFolder } from 'obsidian';
import { parseEventFile } from './parse';
import {
	applyEventToRecord,
	dedupeFileName,
	sanitizeFileName,
	type EventInput,
} from './frontmatter';
import type { CountdownEvent } from './event';

export type EventListener = (events: CountdownEvent[]) => void;

/**
 * In-memory normalized event list backed by markdown files in the configured
 * folder. All writes go through `app.fileManager.processFrontMatter` so user
 * content (body + handwritten frontmatter) is preserved. External edits are
 * picked up live via vault/metadataCache events.
 */
export class EventStore {
	private readonly app: App;
	private readonly getFolder: () => string;
	private events = new Map<string, CountdownEvent>();
	private readonly listeners = new Set<EventListener>();

	constructor(app: App, getFolder: () => string) {
		this.app = app;
		this.getFolder = getFolder;
	}

	/** Current snapshot (unsorted — ordering is the view's concern). */
	getEvents(): CountdownEvent[] {
		return [...this.events.values()];
	}

	/** Subscribe to list changes. Returns an unsubscribe function. */
	subscribe(listener: EventListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		const events = this.getEvents();
		for (const listener of this.listeners) listener(events);
	}

	private folder(): string {
		return this.getFolder().replace(/^\/+|\/+$/g, '');
	}

	private inScope(file: TFile): boolean {
		if (file.extension !== 'md') return false;
		const folder = this.folder();
		return folder === '' ? true : file.path.startsWith(`${folder}/`);
	}

	/** Full scan of the configured folder (plugin load + metadata resolutions). */
	async refresh(): Promise<void> {
		const previous = this.events;
		const next = new Map<string, CountdownEvent>();
		const folder = this.folder();
		const files = folder === ''
			? this.app.vault.getMarkdownFiles()
			: this.app.vault
					.getFolderByPath(folder)
					?.children.filter((f): f is TFile => f instanceof TFile) ?? [];
		for (const file of files) {
			if (file.extension !== 'md') continue;
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
			// no frontmatter object at all → not an event; skip silently (the
			// folder may hold plain notes, and at startup the cache is empty)
			if (!frontmatter) continue;
			const event = parseEventFile(file.path, frontmatter);
			if (event) next.set(file.path, event);
		}
		this.events = next;
		// only re-render the view when the snapshot actually changed —
		// refresh() runs on every metadata resolution batch (see register)
		if (!sameEvents(previous, next)) this.notify();
	}

	/** Attach vault listeners. Call once from plugin.onload via registerEvent. */
	register(plugin: Plugin): void {
		plugin.registerEvent(
			// App-startup race: plugin onload runs before metadataCache has
			// resolved frontmatter, so the first full scan may see nothing at
			// all (fresh vault, freshly synced files). Re-scan whenever the
			// cache finishes a resolution batch; refresh() notifies only on
			// real diffs, so idle batches are cheap.
			this.app.metadataCache.on('resolved', () => void this.refresh()),
		);
		plugin.registerEvent(
			// 'changed' = content modified AND metadataCache reparsed — the
			// reliable "modify" signal for frontmatter.
			this.app.metadataCache.on('changed', (file) => {
				if (!this.inScope(file)) return;
				const event = parseEventFile(
					file.path,
					this.app.metadataCache.getFileCache(file)?.frontmatter ?? null,
				);
				if (event) this.events.set(file.path, event);
				else this.events.delete(file.path);
				this.notify();
			}),
		);
		plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.events.delete(oldPath);
				if (file instanceof TFile && this.inScope(file)) {
					const event = parseEventFile(
						file.path,
						this.app.metadataCache.getFileCache(file)?.frontmatter ?? null,
					);
					if (event) this.events.set(file.path, event);
				}
				this.notify();
			}),
		);
		plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.events.delete(file.path);
				this.notify();
			}),
		);
		plugin.registerEvent(
			this.app.vault.on('create', (file) => {
				if (!(file instanceof TFile) || !this.inScope(file)) return;
				// New files start empty; the 'changed' event after our
				// processFrontMatter write does the real insert.
				const event = parseEventFile(
					file.path,
					this.app.metadataCache.getFileCache(file)?.frontmatter ?? null,
				);
				if (event) {
					this.events.set(file.path, event);
					this.notify();
				}
			}),
		);
	}

	/** Create a new event file (auto-creates the folder, dedupes the name). */
	async createEvent(name: string, input: EventInput): Promise<TFile> {
		const folder = this.folder();
		if (folder !== '') {
			const existing = this.app.vault.getFolderByPath(folder);
			if (!existing) await this.app.vault.createFolder(folder);
		}
		const names = new Set(
			this.getFolderFiles().map((f) => f.name.replace(/\.md$/i, '')),
		);
		const fileName = dedupeFileName(sanitizeFileName(name), names);
		const path = folder === '' ? `${fileName}.md` : `${folder}/${fileName}.md`;
		const file = await this.app.vault.create(path, '');
		await this.writeEvent(file, input);
		return file;
	}

	/** Update an existing event's frontmatter fields (unknown keys untouched). */
	async updateEvent(path: string, input: EventInput): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) throw new Error(`[countdown-day] event file not found: ${path}`);
		await this.writeEvent(file, input);
	}

	/** Rename an event file (Obsidian updates links). Returns the new path. */
	async renameEvent(path: string, newName: string): Promise<string> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return path;
		const names = new Set(
			this.getFolderFiles()
				.filter((f) => f.path !== path)
				.map((f) => f.name.replace(/\.md$/i, '')),
		);
		const fileName = dedupeFileName(sanitizeFileName(newName), names);
		const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
		const newPath = folder === '' ? `${fileName}.md` : `${folder}/${fileName}.md`;
		if (newPath !== path) await this.app.vault.rename(file, newPath);
		return newPath;
	}

	/** Move an event file to trash per the user's deletion preference. */
	async deleteEvent(path: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;
		await this.app.fileManager.trashFile(file);
	}

	/** Pin/unpin an event (frontmatter `pinned: true`; key removed when unpinning). */
	async setPinned(path: string, pinned: boolean): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			if (pinned) fm['pinned'] = true;
			else delete fm['pinned'];
		});
		// the metadataCache 'changed' listener updates the in-memory event
	}

	private async writeEvent(file: TFile, input: EventInput): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			applyEventToRecord(fm, input);
		});
	}

	private getFolderFiles(): TFile[] {
		const folder = this.folder();
		if (folder === '') return this.app.vault.getMarkdownFiles();
		const node = this.app.vault.getFolderByPath(folder);
		return node instanceof TFolder
			? node.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
			: [];
	}
}

/** Value equality of two parsed events (all fields primitives / number[]). */
function sameEvent(a: CountdownEvent, b: CountdownEvent): boolean {
	if (a.path !== b.path || a.name !== b.name || a.type !== b.type) return false;
	if (a.date !== b.date || a.calendar !== b.calendar || a.leapMonth !== b.leapMonth) return false;
	if (a.repeat !== b.repeat || a.repeatEvery !== b.repeatEvery) return false;
	if (a.note !== b.note || a.pinned !== b.pinned) return false;
	if (a.remind?.length !== b.remind?.length) return false;
	if (a.remind !== undefined && b.remind !== undefined) {
		for (let i = 0; i < a.remind.length; i++) {
			if (a.remind[i] !== b.remind[i]) return false;
		}
	}
	return true;
}

function sameEvents(
	a: Map<string, CountdownEvent>,
	b: Map<string, CountdownEvent>,
): boolean {
	if (a.size !== b.size) return false;
	for (const [path, event] of a) {
		const other = b.get(path);
		if (!other || !sameEvent(event, other)) return false;
	}
	return true;
}
