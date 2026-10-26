import { afterEach, describe, expect, it } from 'vitest';
import {
	clampMonth,
	convertPick,
	decadeOf,
	monthGrid,
	shiftMonth,
	yearsInDecade,
} from '../../src/card-view/date-picker';
import {
	lunarDayLabel,
	lunarLabelChinese,
	lunarMonthLabel,
} from '../../src/card-view/date-display';
import { setLocale } from '../../src/settings-i18n/i18n';

afterEach(() => setLocale('en'));

describe('monthGrid', () => {
	it('produces a 42-cell Sunday-first grid with leading blanks', () => {
		// 2026-01-01 is a Thursday (weekday 4)
		const grid = monthGrid(2026, 1);

		expect(grid).toHaveLength(42);
		expect(grid.slice(0, 4)).toEqual([null, null, null, null]);
		expect(grid[4]).toBe(1);
		expect(grid[4 + 30]).toBe(31); // January has 31 days
		expect(grid.slice(35)).toEqual([null, null, null, null, null, null, null]);
	});

	it('rows end exactly at the month end when no blanks follow', () => {
		// 2025-10-01 is a Wednesday (weekday 3); 31 days → 3 + 31 = 34 → padded to 42
		const grid = monthGrid(2025, 10);
		expect(grid.filter((d) => d !== null)).toHaveLength(31);
	});

	it('handles leap February', () => {
		const grid = monthGrid(2024, 2);
		expect(grid.filter((d) => d !== null)).toHaveLength(29);
		expect(grid.filter((d) => d === 29)).toHaveLength(1);
	});
});

describe('shiftMonth / clampMonth', () => {
	it('shifts within a year and across year boundaries', () => {
		expect(shiftMonth(2026, 3, 1)).toEqual({ y: 2026, m: 4 });
		expect(shiftMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
		expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
	});

	it('clamps to the lunar library range (1900–2100)', () => {
		expect(clampMonth(1850, 5)).toEqual({ y: 1900, m: 1 });
		expect(clampMonth(2200, 5)).toEqual({ y: 2100, m: 12 });
		expect(clampMonth(2026, 3)).toEqual({ y: 2026, m: 3 });
	});
});

describe('decadeOf / yearsInDecade', () => {
	it('derives the decade start', () => {
		expect(decadeOf(2026)).toBe(2020);
		expect(decadeOf(2020)).toBe(2020);
		expect(decadeOf(1900)).toBe(1900);
		expect(decadeOf(2100)).toBe(2100);
	});

	it('lists the ten years of a decade', () => {
		expect(yearsInDecade(2020)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029]);
	});

	it('clamps decade edges to the supported range', () => {
		expect(yearsInDecade(1890)).toEqual([1900, 1901, 1902, 1903, 1904, 1905, 1906, 1907, 1908, 1909]);
		expect(yearsInDecade(2100)).toEqual([2100]);
	});
});

describe('convertPick', () => {
	it('passes solar picks through (no leap month)', () => {
		expect(convertPick(2026, 12, 18, 'solar')).toEqual({
			y: 2026,
			m: 12,
			d: 18,
			leapMonth: false,
		});
	});

	it('converts solar picks into the lunar calendar', () => {
		// 2027-02-06 is 正月初一 2027
		expect(convertPick(2027, 2, 6, 'lunar')).toEqual({
			y: 2027,
			m: 1,
			d: 1,
			leapMonth: false,
		});
	});

	it('detects leap lunar months from the picked solar date', () => {
		// 2023 闰二月: 2023-03-22 is 闰二月初一
		expect(convertPick(2023, 3, 22, 'lunar')).toEqual({
			y: 2023,
			m: 2,
			d: 1,
			leapMonth: true,
		});
	});
});

describe('lunar labels', () => {
	it('formats months (incl. 冬月/腊月 and leap prefix)', () => {
		expect(lunarMonthLabel(1, false)).toBe('正月');
		expect(lunarMonthLabel(11, false)).toBe('冬月');
		expect(lunarMonthLabel(12, false)).toBe('腊月');
		expect(lunarMonthLabel(2, true)).toBe('闰二月');
	});

	it('formats days (初十 / 廿七 / 三十)', () => {
		expect(lunarDayLabel(1)).toBe('初一');
		expect(lunarDayLabel(10)).toBe('初十');
		expect(lunarDayLabel(27)).toBe('廿七');
		expect(lunarDayLabel(30)).toBe('三十');
	});

	it('combines month and day', () => {
		expect(lunarLabelChinese(2026, 11, 10, false)).toBe('冬月初十');
		expect(lunarLabelChinese(2023, 2, 15, true)).toBe('闰二月十五');
	});
});
