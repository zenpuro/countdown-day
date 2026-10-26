import { describe, expect, it } from 'vitest';
import { suppressImeKeydown } from '../../src/settings-i18n/settings-tab';

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
