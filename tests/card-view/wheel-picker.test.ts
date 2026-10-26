import { afterEach, describe, expect, it } from 'vitest';
import {
	lunarDayOptions,
	lunarMonthOptions,
	solarDayOptions,
	solarMonthOptions,
	wheelIndexOf,
	wheelYearOptions,
} from '../../src/card-view/wheel-picker';
import { setLocale } from '../../src/settings-i18n/i18n';

/** Mobile wheel-picker option lists (pure logic). */
afterEach(() => setLocale('en'));

describe('wheelYearOptions', () => {
	it('covers the supported range 1900–2100', () => {
		const years = wheelYearOptions();
		expect(years).toHaveLength(201);
		expect(years[0]).toEqual({ value: '1900', label: '1900' });
		expect(years.at(-1)).toEqual({ value: '2100', label: '2100' });
	});
});

describe('solar wheel options', () => {
	it('months are 1–12', () => {
		expect(solarMonthOptions()).toHaveLength(12);
		expect(solarMonthOptions()[0]).toEqual({ value: '1', label: '1' });
	});

	it('days follow the month length (leap February 2024 → 29)', () => {
		expect(solarDayOptions(2024, 2)).toHaveLength(29);
		expect(solarDayOptions(2023, 2)).toHaveLength(28);
		expect(solarDayOptions(2025, 10)).toHaveLength(31);
	});
});

describe('lunar wheel options', () => {
	it('inserts the leap month after its normal month (2023 闰二月)', () => {
		const months = lunarMonthOptions(2023);
		const values = months.map((m) => m.value);
		expect(values.slice(0, 4)).toEqual(['1', '2', '2L', '3']);
		expect(months.find((m) => m.value === '2L')?.label).toBe('闰二月');
		expect(months).toHaveLength(13);
	});

	it('a year without a leap month keeps 12 entries (2022)', () => {
		expect(lunarMonthOptions(2022)).toHaveLength(12);
		expect(lunarMonthOptions(2022).some((m) => m.value.endsWith('L'))).toBe(false);
	});

	it('days follow the lunar month length with 初一…三十 labels', () => {
		const days = lunarDayOptions(2025, 1, false);
		expect(days.length).toBeGreaterThanOrEqual(29);
		expect(days.length).toBeLessThanOrEqual(30);
		expect(days[0]?.label).toBe('初一');
		expect(days.at(-1)?.label).toMatch(/廿九|三十/);
	});
});

describe('wheelIndexOf', () => {
	it('finds the index of a value and falls back to 0', () => {
		const options = solarMonthOptions();
		expect(wheelIndexOf(options, '3')).toBe(2);
		expect(wheelIndexOf(options, 'nope')).toBe(0);
	});
});
