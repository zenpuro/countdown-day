import { afterEach, describe, expect, it } from 'vitest';
import {
	buildEventInput,
	defaultRepeatForType,
	namePlaceholderKey,
	remindDayLabel,
	REMIND_PRESETS,
	type EventFormState,
} from '../../src/card-view/form-logic';
import { setLocale } from '../../src/settings-i18n/i18n';
import { t } from '../../src/settings-i18n/i18n';

const state = (overrides: Partial<EventFormState>): EventFormState => ({
	name: 'Trip',
	type: 'countdown',
	calendar: 'solar',
	y: 2030,
	m: 1,
	d: 1,
	leapMonth: false,
	repeat: 'none',
	repeatEvery: '3',
	note: '',
	remind: [],
	...overrides,
});

afterEach(() => setLocale('en'));

describe('defaultRepeatForType', () => {
	it('countdown → none; birthday/anniversary → yearly', () => {
		expect(defaultRepeatForType('countdown')).toBe('none');
		expect(defaultRepeatForType('birthday')).toBe('yearly');
		expect(defaultRepeatForType('anniversary')).toBe('yearly');
	});
});

describe('buildEventInput', () => {
	it('builds a full EventInput from a valid form state', () => {
		const result = buildEventInput(
			state({
				type: 'birthday',
				calendar: 'lunar',
				y: 1985,
				m: 6,
				d: 8,
				repeat: 'yearly',
				note: '[[家人]]',
				remind: [3],
			}),
		);

		expect(result).toEqual({
			ok: true,
			input: {
				type: 'birthday',
				date: '1985-06-08',
				calendar: 'lunar',
				repeat: 'yearly',
				note: '[[家人]]',
				remind: [3],
			},
			fileName: 'Trip',
		});
	});

	it('keeps leapMonth in the input for leap lunar dates', () => {
		const result = buildEventInput(
			state({
				type: 'anniversary',
				calendar: 'lunar',
				y: 2023,
				m: 2,
				d: 15,
				leapMonth: true,
				repeat: 'yearly',
			}),
		);

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.input.leapMonth).toBe(true);
	});

	it('rejects an empty name', () => {
		const result = buildEventInput(state({ name: '   ' }));
		expect(result).toEqual({ ok: false, error: 'nameRequired' });
	});

	it('sanitizes illegal characters out of the file name', () => {
		const result = buildEventInput(state({ name: 'Trip: 2025*计划' }));
		expect(result.ok && result.fileName).toBe('Trip 2025计划');
	});

	it('includes repeatEvery for repeat=custom and validates it', () => {
		const ok = buildEventInput(state({ repeat: 'custom', repeatEvery: '14' }));
		expect(ok.ok && ok.input.repeatEvery).toBe(14);

		for (const bad of ['0', '-2', '1.5', 'abc', '']) {
			expect(buildEventInput(state({ repeat: 'custom', repeatEvery: bad }))).toEqual({
				ok: false,
				error: 'repeatEveryInvalid',
			});
		}
	});

	it('omits repeatEvery for non-custom repeats', () => {
		const result = buildEventInput(state({ repeat: 'weekly', repeatEvery: '14' }));
		expect(result.ok && result.input.repeatEvery).toBeUndefined();
	});

	it('name placeholder key follows the type', () => {
		setLocale('en');
		expect(namePlaceholderKey('countdown')).toBe('card-view.form.namePlaceholder.countdown');
		expect(t(namePlaceholderKey('birthday') as never)).toBe('Their name');
	});

	it('rejects impossible solar dates (2/30)', () => {
		const result = buildEventInput(state({ y: 2025, m: 2, d: 30 }));
		expect(result).toEqual({ ok: false, error: 'dateInvalid' });
	});

	it('rejects lunar day-30 in a 29-day month (2025 腊月)', () => {
		const result = buildEventInput(
			state({ calendar: 'lunar', y: 2025, m: 12, d: 30, repeat: 'none' }),
		);
		expect(result).toEqual({ ok: false, error: 'dateInvalid' });
	});

	it('rejects a leap month the year does not have', () => {
		const result = buildEventInput(
			state({ calendar: 'lunar', y: 2024, m: 2, d: 15, leapMonth: true }),
		);
		expect(result).toEqual({ ok: false, error: 'dateInvalid' });
	});

	it('dedupes and sorts remind days; rejects invalid entries', () => {
		expect(buildEventInput(state({ remind: [3, 0, 3, 1] }))).toMatchObject({
			ok: true,
			input: { remind: [0, 1, 3] },
		});

		expect(buildEventInput(state({ remind: [-1, 3] }))).toEqual({
			ok: false,
			error: 'remindInvalid',
		});
		expect(buildEventInput(state({ remind: [2.5] }))).toEqual({
			ok: false,
			error: 'remindInvalid',
		});

		const empty = buildEventInput(state({ remind: [] }));
		expect(empty.ok && empty.input.remind).toBeUndefined();

		const zero = buildEventInput(state({ remind: [0] }));
		expect(zero.ok && zero.input.remind).toEqual([0]);
	});

	it('omits note when empty', () => {
		const result = buildEventInput(state({ note: '' }));
		expect(result.ok && result.input.note).toBeUndefined();
	});

	it('rejects years outside the supported lunar range for lunar dates', () => {
		const result = buildEventInput(
			state({ calendar: 'lunar', y: 1800, m: 1, d: 1 }),
		);
		expect(result).toEqual({ ok: false, error: 'yearRange' });
	});
});

describe('remind presets', () => {
	it('offers day 0 / 1 / 2 / 3 / 7', () => {
		expect(REMIND_PRESETS).toEqual([0, 1, 2, 3, 7]);
	});

	it('labels are localized', () => {
		setLocale('en');
		expect(remindDayLabel(0)).toBe('On the day');
		expect(remindDayLabel(3)).toBe('3 day(s) before');

		setLocale('zh');
		expect(remindDayLabel(0)).toBe('当天');
		expect(remindDayLabel(3)).toBe('提前3天');
	});
});
