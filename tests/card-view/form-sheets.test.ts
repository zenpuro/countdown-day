import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { CustomValueSheet } from '../../src/card-view/form-sheets';
import { setLocale } from '../../src/settings-i18n/i18n';

/**
 * Custom-value sheets (自定义提醒 / 自定义重复):
 * - desktop: numeric input + visible range hint (a silently disabled
 *   确定 tells the user nothing) that flags out-of-range in error red;
 * - touch wheel: number-only rows inside a static 提前/天 frame —
 *   scrolling moves just the number, never the prefix/unit.
 */

afterEach(() => setLocale('en'));

/** Render a desktop sheet: jsdom has no matchMedia, so isCoarsePointer()
 * is false and the numeric-input branch renders. */
function openSheet(
	min: number,
	max: number,
	current: number,
	onConfirmValue: (n: number) => void,
) {
	const sheet = new CustomValueSheet(new App(), {
		title: 'Custom',
		min,
		max,
		current,
		unitKey: 'card-view.form.remind.customUnit',
		prefixKey: 'card-view.form.remind.customPrefix',
		onConfirmValue,
	});
	sheet.onOpen();
	return {
		confirm: sheet.modalEl.querySelector('.countdown-sheet__confirm') as HTMLButtonElement,
		hint: sheet.modalEl.querySelector('.countdown-sheet__hint') as HTMLElement,
		input: sheet.modalEl.querySelector('.countdown-form__interval-input') as HTMLInputElement,
	};
}

function type(input: HTMLInputElement, text: string): void {
	input.value = text;
	input.dispatchEvent(new Event('input'));
}

describe('CustomValueSheet range hint', () => {
	it('states the allowed range up front, localized', () => {
		const en = openSheet(1, 30, 14, () => {});
		expect(en.hint.textContent).toBe('Enter a whole number between 1 and 30');
		expect(en.input.getAttribute('aria-describedby')).toBe(en.hint.getAttribute('id'));

		setLocale('zh');
		const zh = openSheet(1, 30, 14, () => {});
		expect(zh.hint.textContent).toBe('请输入 1–30 之间的整数');
	});

	it('reflects each sheet\'s own bounds (repeat interval 1–31)', () => {
		const { hint } = openSheet(1, 31, 3, () => {});
		expect(hint.textContent).toBe('Enter a whole number between 1 and 31');
	});

	it('flags out-of-range input red and disables confirm; recovers on valid input', () => {
		const { confirm, hint, input } = openSheet(1, 30, 14, () => {});
		expect(confirm.disabled).toBe(false);
		expect(hint.classList.contains('is-error')).toBe(false);

		type(input, '31');
		expect(confirm.disabled).toBe(true);
		expect(hint.classList.contains('is-error')).toBe(true);

		type(input, '30');
		expect(confirm.disabled).toBe(false);
		expect(hint.classList.contains('is-error')).toBe(false);
	});

	it('still confirms the entered value through 确定', () => {
		let picked: number | null = null;
		const { confirm, input } = openSheet(1, 30, 14, (n) => {
			picked = n;
		});
		type(input, '12');
		confirm.click();
		expect(picked).toBe(12);
	});

	it('wheel branch: static 提前/天 frame, number-only scrolling rows', () => {
		// jsdom has no matchMedia (coarse-pointer off by default) and its rAF
		// callbacks would hit the unimplemented Element.scrollTo — define a
		// matchMedia stub and silence rAF for the duration of the test
		window.matchMedia = (query: string) => ({ matches: query.includes('coarse') }) as MediaQueryList;
		const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
		try {
			setLocale('zh');
			let picked: number | null = null;
			const sheet = new CustomValueSheet(new App(), {
				title: '自定义提醒',
				min: 1,
				max: 30,
				current: 14,
				unitKey: 'card-view.form.remind.customUnit',
				prefixKey: 'card-view.form.remind.customPrefix',
				onConfirmValue: (n) => {
					picked = n;
				},
			});
			sheet.onOpen();

			// the frame: [提前] [wheel] [天] — labels outside the wheel
			const wrap = sheet.modalEl.querySelector('.countdown-wheels--single') as HTMLElement;
			const frameLabels = [...wrap.children]
				.filter((el) => el.classList.contains('countdown-form__interval-label'))
				.map((el) => el.textContent);
			expect(frameLabels).toEqual(['提前', '天']);

			// rows are bare numbers — prefix/unit never scroll past
			const rows = [...wrap.querySelectorAll('.countdown-wheel__item')]
				.map((el) => el.textContent ?? '');
			expect(rows).toHaveLength(30);
			for (const row of rows) expect(row).toMatch(/^\d+$/);

			// no range hint on the wheel branch (the wheel bounds the range)
			expect(sheet.modalEl.querySelector('.countdown-sheet__hint')).toBeNull();

			(sheet.modalEl.querySelector('.countdown-sheet__confirm') as HTMLButtonElement).click();
			expect(picked).toBe(14);
		} finally {
			raf.mockRestore();
			delete (window as { matchMedia?: unknown }).matchMedia;
		}
	});
});
