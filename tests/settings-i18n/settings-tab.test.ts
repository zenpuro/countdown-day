import { describe, expect, it } from 'vitest';
import { App, textComponents } from '../mocks/obsidian';
import {
	CountdownSettingTab,
	FolderSuggest,
	suppressImeKeydown,
} from '../../src/settings-i18n/settings-tab';

/**
 * The folder suggest must not react to IME key events: while composing
 * Chinese, Enter (keyCode 229) commits candidates — if Obsidian's
 * AbstractInputSuggest saw it, it replaced the half-typed folder path with
 * the highlighted suggestion (倒数纪念日 → 倒数).
 */
function keydown(init: { isComposing?: boolean; keyCode: number }): KeyboardEvent {
	const event = new KeyboardEvent('keydown', {
		bubbles: true,
		cancelable: true,
	});
	Object.defineProperty(event, 'isComposing', { value: init.isComposing ?? false });
	Object.defineProperty(event, 'keyCode', { value: init.keyCode });
	return event;
}

describe('suppressImeKeydown', () => {
	it('blocks composing key events from reaching later (suggest) listeners', () => {
		const input = document.createElement('input');
		const seen: string[] = [];
		input.addEventListener('keydown', (e) => seen.push(e.type)); // stands in for the suggest

		suppressImeKeydown(input);
		input.dispatchEvent(keydown({ isComposing: true, keyCode: 229 }));
		input.dispatchEvent(keydown({ keyCode: 229 })); // some engines: not flagged, but 229

		expect(seen).toHaveLength(0);
	});

	it('lets regular key events through', () => {
		const input = document.createElement('input');
		const seen: string[] = [];
		input.addEventListener('keydown', (e) => seen.push(e.type));

		suppressImeKeydown(input);
		input.dispatchEvent(keydown({ keyCode: 13 })); // plain Enter, no composition
		input.dispatchEvent(keydown({ keyCode: 65 })); // letter

		expect(seen).toHaveLength(2);
	});
});

/** Plugin double with spies for the two effects applyFolder must trigger. */
function makeEnv() {
	const settings = { eventFolder: 'Countdowns' };
	const savedAt: string[] = [];
	let refreshes = 0;
	const plugin = {
		settings,
		saveSettings: async () => {
			savedAt.push(settings.eventFolder);
		},
		store: {
			refresh: async () => {
				refreshes++;
			},
		},
	};
	const tab = new CountdownSettingTab(new App() as never, plugin as never);
	return {
		settings,
		savedAt,
		refreshes: () => refreshes,
		display() {
			textComponents.length = 0;
			tab.display();
			return textComponents[0];
		},
	};
}

describe('FolderSuggest.selectSuggestion — picked suggestion must persist', () => {
	it('writes the input text AND forwards the path to onSelect', () => {
		const input = document.createElement('input');
		input.value = '03-resources/';
		const picked: string[] = [];
		const suggest = new FolderSuggest(new App() as never, input, (path) => picked.push(path));

		suggest.selectSuggestion('03-resources/倒数纪念日');

		// AbstractInputSuggest.setValue only writes the input text — without
		// the onSelect callback the picked path never reached settings, so the
		// choice reverted on the next settings re-render (reported bug)
		expect(input.value).toBe('03-resources/倒数纪念日');
		expect(picked).toEqual(['03-resources/倒数纪念日']);
	});
});

describe('CountdownSettingTab — folder change must save + re-scan the store', () => {
	it('persists typed input and re-scans (view refreshes without restart)', () => {
		const env = makeEnv();
		const component = env.display();

		component.fireChange('03-resources/倒数纪念日');

		expect(env.settings.eventFolder).toBe('03-resources/倒数纪念日');
		expect(env.savedAt).toEqual(['03-resources/倒数纪念日']);
		expect(env.refreshes()).toBe(1);
	});

	it('skips no-op writes (same folder → no save, no re-scan)', () => {
		const env = makeEnv();
		const component = env.display();

		component.fireChange('Countdowns');

		expect(env.savedAt).toEqual([]);
		expect(env.refreshes()).toBe(0);
	});

	it('trims the value and persists the trimmed folder', () => {
		const env = makeEnv();
		const component = env.display();

		component.fireChange('  Events  ');

		expect(env.settings.eventFolder).toBe('Events');
		expect(env.savedAt).toEqual(['Events']);
	});
});
