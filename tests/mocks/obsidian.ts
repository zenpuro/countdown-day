/**
 * Runtime stub for the `obsidian` package (it ships typings only, no JS
 * entry). Includes the DOM helper exports src/ imports (createEl family)
 * and the HTMLElement prototype augmentations Obsidian injects at runtime
 * (setCssStyles) so view-rendering code paths run under jsdom.
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
	/** Mirrors the real API: writes the input text only — never fires
	 * TextComponent.onChange (the regression FolderSuggest.onSelect covers). */
	setValue(value: string): void {
		this.inputEl.value = value;
	}
	getValue(): string {
		return this.inputEl.value;
	}
	close(): void {}
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
	containerEl: HTMLElement = document.createElement('div');
	constructor(
		public app: App,
		public plugin: unknown,
	) {}
	display(): void {}
}

/** Captured addText components so tests can drive the onChange callback. */
export interface MockTextComponent {
	inputEl: HTMLInputElement;
	fireChange(value: string): void;
}
export const textComponents: MockTextComponent[] = [];

export class Setting {
	constructor(public containerEl: HTMLElement) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(cb: (component: never) => unknown): this {
		const inputEl = document.createElement('input');
		let changeCb: ((value: string) => unknown) | null = null;
		const component = {
			inputEl,
			setPlaceholder(): unknown {
				return component;
			},
			setValue(value: string): unknown {
				inputEl.value = value;
				return component;
			},
			onChange(onChangeCb: (value: string) => unknown): unknown {
				changeCb = onChangeCb;
				return component;
			},
			// BaseComponent.then is Obsidian's thenable chain hook
			then(thenCb: (c: unknown) => unknown): unknown {
				thenCb(component);
				return component;
			},
		};
		textComponents.push({
			inputEl,
			fireChange: (value: string) => changeCb?.(value),
		});
		cb(component as never);
		return this;
	}
}

/* ---- DOM helpers ----
 * Obsidian injects `createEl`/`createDiv`/`createSpan` as globals and as
 * HTMLElement methods at runtime, and augments `setCssStyles`. Types come
 * from obsidian.d.ts; these stubs provide the runtime behavior under jsdom.
 */

type DomElementInfo = { cls?: string; text?: string; attr?: Record<string, string> };

function applyInfo<T extends HTMLElement>(el: T, o?: DomElementInfo | string): T {
	if (typeof o === 'string') el.className = o;
	else if (o) {
		if (o.cls) el.className = o.cls;
		if (o.text !== undefined) el.textContent = o.text;
		if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
	}
	return el;
}

function makeEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	o?: DomElementInfo | string,
): HTMLElementTagNameMap[K] {
	return applyInfo(document.createElement(tag), o);
}

const g = globalThis as unknown as Record<string, unknown>;

g.createEl ??= (tag: keyof HTMLElementTagNameMap, o?: DomElementInfo | string) => makeEl(tag, o);
g.createDiv ??= (o?: DomElementInfo | string) => makeEl('div', o);
g.createSpan ??= (o?: DomElementInfo | string) => makeEl('span', o);

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

proto.createEl ??= function (this: HTMLElement, tag: keyof HTMLElementTagNameMap, o?: DomElementInfo | string) {
	const el = makeEl(tag, o);
	this.append(el);
	return el;
};
proto.createDiv ??= function (this: HTMLElement, o?: DomElementInfo | string) {
	const el = makeEl('div', o);
	this.append(el);
	return el;
};
proto.createSpan ??= function (this: HTMLElement, o?: DomElementInfo | string) {
	const el = makeEl('span', o);
	this.append(el);
	return el;
};
proto.setCssStyles ??= function (this: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
	Object.assign(this.style, styles);
};
proto.empty ??= function (this: HTMLElement) {
	this.textContent = '';
};
