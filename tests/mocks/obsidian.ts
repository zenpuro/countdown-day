/**
 * Runtime stub for the `obsidian` package (it ships typings only, no JS
 * entry). Modules under test import only types/constructors from it; DOM
 * helpers used in tests (createDiv etc.) come from the jsdom environment.
 */
export class App {}

export class Modal {}

/** Minimal base so FolderSuggest (settings-tab) can extend it at import time. */
export class AbstractInputSuggest<T> {
	constructor(
		public app: App,
		public inputEl: HTMLInputElement,
	) {}
	getSuggestions(_query: string): T[] {
		return [];
	}
}

export class Plugin {}

export class TFile {
	path = '';
	name = '';
	basename = '';
	extension = 'md';
}

export class TFolder {
	children: unknown[] = [];
}

/** Desktop in tests; mobile-specific branches stay uncovered. */
export const Platform = { isMobile: false };

/** Stub for settings-tab: CountdownSettingTab extends this at import time. */
export class PluginSettingTab {
	constructor(
		public app: App,
		public plugin: unknown,
	) {}
	display(): void {}
}

export class Setting {
	constructor(public containerEl: HTMLElement) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(_cb: (component: never) => unknown): this {
		return this;
	}
}
