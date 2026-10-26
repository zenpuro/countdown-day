import { describe, expect, it } from 'vitest';
import {
	isValidLunarDate,
	lunarLeapMonth,
	lunarMonthDays,
	lunarToSolar,
	nextOccurrence,
	solarToLunar,
} from '../../src/date-engine/date-engine';

/** Local-midnight Date helper — all spec comparisons are day-granularity. */
const d = (y: number, m: number, day: number): Date => new Date(y, m - 1, day);

describe('nextOccurrence — solar, repeat: none', () => {
	it('future date → next = date, daysUntil > 0', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 12, d: 25 }, calendar: 'solar', repeat: 'none' },
			d(2025, 10, 16),
		);

		expect(result.next).toStrictEqual(d(2025, 12, 25));
		expect(result.daysUntil).toBe(70);
	});

	it('past date → next = null, daysUntil < 0 (已过 N 天)', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 1, d: 1 }, calendar: 'solar', repeat: 'none' },
			d(2025, 10, 16),
		);

		expect(result.next).toBeNull();
		expect(result.daysUntil).toBe(-288);
	});

	it('today → daysUntil = 0 and next = today', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 10, d: 16 }, calendar: 'solar', repeat: 'none' },
			d(2025, 10, 16),
		);

		expect(result.next).toStrictEqual(d(2025, 10, 16));
		expect(result.daysUntil).toBe(0);
	});
});

describe('nextOccurrence — solar, repeat: yearly', () => {
	it('anniversary later this year → this year', () => {
		const result = nextOccurrence(
			{ date: { y: 2024, m: 12, d: 25 }, calendar: 'solar', repeat: 'yearly' },
			d(2025, 10, 16),
		);

		expect(result.next).toStrictEqual(d(2025, 12, 25));
		expect(result.daysUntil).toBe(70);
	});

	it('anniversary already passed this year → next year', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 3, d: 8 }, calendar: 'solar', repeat: 'yearly' },
			d(2025, 10, 16),
		);

		expect(result.next).toStrictEqual(d(2026, 3, 8));
		expect(result.daysUntil).toBe(143);
	});

	it('2/29 event in non-leap target year → 2/28', () => {
		const result = nextOccurrence(
			{ date: { y: 2024, m: 2, d: 29 }, calendar: 'solar', repeat: 'yearly' },
			d(2025, 1, 15),
		);

		expect(result.next).toStrictEqual(d(2025, 2, 28));
		expect(result.daysUntil).toBe(44);
	});

	it('2/29 event in leap target year stays 2/29', () => {
		const result = nextOccurrence(
			{ date: { y: 2024, m: 2, d: 29 }, calendar: 'solar', repeat: 'yearly' },
			d(2028, 1, 15),
		);

		expect(result.next).toStrictEqual(d(2028, 2, 29));
		expect(result.daysUntil).toBe(45);
	});

	it('today is the anniversary → daysUntil = 0', () => {
		const result = nextOccurrence(
			{ date: { y: 2000, m: 10, d: 16 }, calendar: 'solar', repeat: 'yearly' },
			d(2025, 10, 16),
		);

		expect(result.next).toStrictEqual(d(2025, 10, 16));
		expect(result.daysUntil).toBe(0);
	});
});

describe('nextOccurrence — lunar, repeat: yearly', () => {
	it('lunar date later in current lunar year → this year (八月十五 2025-10-06)', () => {
		const result = nextOccurrence(
			{ date: { y: 2024, m: 8, d: 15 }, calendar: 'lunar', repeat: 'yearly' },
			d(2025, 6, 1),
		);

		expect(result.next).toStrictEqual(d(2025, 10, 6));
		expect(result.daysUntil).toBe(127);
	});

	it('lunar date passed this lunar year → next lunar year (春节 2026-02-17)', () => {
		const result = nextOccurrence(
			{ date: { y: 2024, m: 1, d: 1 }, calendar: 'lunar', repeat: 'yearly' },
			d(2025, 6, 1),
		);

		expect(result.next).toStrictEqual(d(2026, 2, 17));
		expect(result.daysUntil).toBe(261);
	});

	it('leap-month event in 2023 resolves to the actual leap month (闰二月十五 → 2023-04-05)', () => {
		const result = nextOccurrence(
			{
				date: { y: 2023, m: 2, d: 15, leapMonth: true },
				calendar: 'lunar',
				repeat: 'yearly',
			},
			d(2023, 3, 1),
		);

		expect(result.next).toStrictEqual(d(2023, 4, 5));
		expect(result.daysUntil).toBe(35);
	});

	it('leap-month event in a year without that leap month → normal month (2024 闰二月 → 二月十五 = 2024-03-24)', () => {
		const result = nextOccurrence(
			{
				date: { y: 2023, m: 2, d: 15, leapMonth: true },
				calendar: 'lunar',
				repeat: 'yearly',
			},
			d(2024, 3, 1),
		);

		expect(result.next).toStrictEqual(d(2024, 3, 24));
		expect(result.daysUntil).toBe(23);
	});

	it('day-30 event in a 29-day month → 廿九 (2025 腊月三十 → 2026-02-16, 无年三十 case)', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 12, d: 30 }, calendar: 'lunar', repeat: 'yearly' },
			d(2025, 6, 1),
		);

		expect(result.next).toStrictEqual(d(2026, 2, 16));
		expect(result.daysUntil).toBe(260);
	});
});

describe('nextOccurrence — lunar, repeat: none', () => {
	it('future lunar date → next = converted solar date', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 8, d: 15 }, calendar: 'lunar', repeat: 'none' },
			d(2025, 6, 1),
		);

		expect(result.next).toStrictEqual(d(2025, 10, 6));
		expect(result.daysUntil).toBe(127);
	});

	it('past lunar date → next = null, daysUntil < 0 (闰二月十五 2023-04-05 已过)', () => {
		const result = nextOccurrence(
			{
				date: { y: 2023, m: 2, d: 15, leapMonth: true },
				calendar: 'lunar',
				repeat: 'none',
			},
			d(2023, 5, 1),
		);

		expect(result.next).toBeNull();
		expect(result.daysUntil).toBe(-26);
	});
});

describe('nextOccurrence — solar, new repeat rules (v1.2)', () => {
	// anchor 2025-01-10 is a Friday; 2025-10-19 is a Sunday

	it('daily: past anchor → today (daysUntil 0)', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 1, d: 10 }, calendar: 'solar', repeat: 'daily' },
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 10, 19));
		expect(result.daysUntil).toBe(0);
	});

	it('daily: future anchor → the anchor itself', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 12, d: 25 }, calendar: 'solar', repeat: 'daily' },
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 12, 25));
		expect(result.daysUntil).toBe(67);
	});

	it('weekdays: Sunday → next Monday; weekday today → today', () => {
		const sunday = nextOccurrence(
			{ date: { y: 2025, m: 1, d: 10 }, calendar: 'solar', repeat: 'weekdays' },
			d(2025, 10, 19),
		);
		expect(sunday.next).toStrictEqual(d(2025, 10, 20));
		expect(sunday.daysUntil).toBe(1);

		const friday = nextOccurrence(
			{ date: { y: 2025, m: 1, d: 10 }, calendar: 'solar', repeat: 'weekdays' },
			d(2025, 10, 17),
		);
		expect(friday.next).toStrictEqual(d(2025, 10, 17));
		expect(friday.daysUntil).toBe(0);
	});

	it('weekdays: future Saturday anchor walks to Monday', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 12, d: 27 }, calendar: 'solar', repeat: 'weekdays' }, // Sat
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 12, 29));
		expect(result.daysUntil).toBe(71);
	});

	it('weekly: repeats on the anchor weekday (Fri anchor → next Friday)', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 1, d: 10 }, calendar: 'solar', repeat: 'weekly' },
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 10, 24));
		expect(result.daysUntil).toBe(5);
	});

	it('weekly: future anchor → the anchor itself', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 12, d: 25 }, calendar: 'solar', repeat: 'weekly' }, // Thu
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 12, 25));
		expect(result.daysUntil).toBe(67);
	});

	it('monthly: same day each month', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 1, d: 31 }, calendar: 'solar', repeat: 'monthly' },
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 10, 31));
		expect(result.daysUntil).toBe(12);
	});

	it('monthly: clamps day 31 to the month length (Nov → 30)', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 1, d: 31 }, calendar: 'solar', repeat: 'monthly' },
			d(2025, 11, 1),
		);
		expect(result.next).toStrictEqual(d(2025, 11, 30));
		expect(result.daysUntil).toBe(29);
	});

	it('custom: every N days from the anchor (every 14 → +294)', () => {
		const result = nextOccurrence(
			{
				date: { y: 2025, m: 1, d: 1 },
				calendar: 'solar',
				repeat: 'custom',
				repeatEvery: 14,
			},
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 10, 22));
		expect(result.daysUntil).toBe(3);
	});

	it('custom: invalid interval clamps to 1 (= daily)', () => {
		const result = nextOccurrence(
			{
				date: { y: 2025, m: 1, d: 1 },
				calendar: 'solar',
				repeat: 'custom',
				repeatEvery: 0,
			},
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 10, 19));
		expect(result.daysUntil).toBe(0);
	});
});

describe('nextOccurrence — lunar, new repeat rules (v1.2)', () => {
	it('monthly: same lunar day each lunar month (中秋 八月十五 → 九月十五 2025-11-04)', () => {
		// 中秋 2025 = 2025-10-06 (八月十五); 重阳 2025 = 2025-10-29 (九月初九)
		const result = nextOccurrence(
			{ date: { y: 2025, m: 8, d: 15 }, calendar: 'lunar', repeat: 'monthly' },
			d(2025, 10, 7),
		);
		expect(result.next).toStrictEqual(d(2025, 11, 4));
		expect(result.daysUntil).toBe(28);
	});

	it('monthly: day-30 in a 29-day month matches the last day (2025 腊月无三十)', () => {
		// 腊月三十 anchor clamps to 廿九 = 2026-02-16 (established boundary sample)
		const result = nextOccurrence(
			{ date: { y: 2025, m: 12, d: 30 }, calendar: 'lunar', repeat: 'monthly' },
			d(2026, 2, 10),
		);
		expect(result.next).toStrictEqual(d(2026, 2, 16));
		expect(result.daysUntil).toBe(6);
	});

	it('monthly: after the clamped month, matches min(30, month length) in the next month', () => {
		const result = nextOccurrence(
			{ date: { y: 2025, m: 12, d: 30 }, calendar: 'lunar', repeat: 'monthly' },
			d(2026, 2, 17), // 正月初一 2026
		);
		expect(result.next).not.toBeNull();
		const lunar = solarToLunar(result.next!);
		const monthLen = lunarMonthDays(lunar.y, lunar.m, lunar.leapMonth);
		expect(lunar.d).toBe(Math.min(30, monthLen));
	});

	it('weekly with a lunar anchor converts to solar first', () => {
		// 2025-08-15 (中秋) = Monday 2025-10-06 → weekly from Sunday 2025-10-19
		const result = nextOccurrence(
			{ date: { y: 2025, m: 8, d: 15 }, calendar: 'lunar', repeat: 'weekly' },
			d(2025, 10, 19),
		);
		expect(result.next).toStrictEqual(d(2025, 10, 20)); // next Monday
		expect(result.daysUntil).toBe(1);
	});
});

describe('day granularity', () => {
	it('ignores time-of-day of today', () => {
		const input = {
			date: { y: 2025, m: 12, d: 25 },
			calendar: 'solar' as const,
			repeat: 'none' as const,
		};
		const morning = nextOccurrence(input, new Date(2025, 9, 16, 0, 0, 0));
		const night = nextOccurrence(input, new Date(2025, 9, 16, 23, 59, 59));

		expect(morning.daysUntil).toBe(night.daysUntil);
		expect(morning.daysUntil).toBe(70);
	});
});

describe('lunarToSolar', () => {
	it('2024 正月初一 → 2024-02-10 (spec cross-validation sample)', () => {
		expect(lunarToSolar({ y: 2024, m: 1, d: 1 })).toStrictEqual(d(2024, 2, 10));
	});

	it('2023 闰二月十五 → 2023-04-05', () => {
		expect(lunarToSolar({ y: 2023, m: 2, d: 15, leapMonth: true })).toStrictEqual(
			d(2023, 4, 5),
		);
	});

	it('clamps day 30 to 29 when the month has 29 days (2025 腊月)', () => {
		expect(lunarToSolar({ y: 2025, m: 12, d: 30 })).toStrictEqual(d(2026, 2, 16));
	});

	it('nonexistent leap month falls back to the normal month (2024 无闰二月)', () => {
		expect(lunarToSolar({ y: 2024, m: 2, d: 15, leapMonth: true })).toStrictEqual(
			d(2024, 3, 24),
		);
	});
});

describe('solarToLunar', () => {
	it('2024-02-10 → 正月初一', () => {
		expect(solarToLunar(d(2024, 2, 10))).toEqual({
			y: 2024,
			m: 1,
			d: 1,
			leapMonth: false,
		});
	});

	it('2023-04-05 → 闰二月十五', () => {
		expect(solarToLunar(d(2023, 4, 5))).toEqual({
			y: 2023,
			m: 2,
			d: 15,
			leapMonth: true,
		});
	});
});

describe('lunarLeapMonth', () => {
	it('returns the leap month number, 0 when none', () => {
		expect(lunarLeapMonth(2023)).toBe(2);
		expect(lunarLeapMonth(2025)).toBe(6);
		expect(lunarLeapMonth(2024)).toBe(0);
		expect(lunarLeapMonth(2026)).toBe(0);
	});
});

describe('isValidLunarDate (strict definition validation)', () => {
	it('accepts a real normal lunar date', () => {
		expect(isValidLunarDate({ y: 2024, m: 1, d: 1 })).toBe(true);
	});

	it('accepts a real leap-month date (2023 闰二月十五)', () => {
		expect(isValidLunarDate({ y: 2023, m: 2, d: 15, leapMonth: true })).toBe(true);
	});

	it('rejects a leap month the year does not have (2024 无闰二月)', () => {
		expect(isValidLunarDate({ y: 2024, m: 2, d: 15, leapMonth: true })).toBe(false);
	});

	it('rejects day-30 in a 29-day month (2025 腊月无三十)', () => {
		expect(isValidLunarDate({ y: 2025, m: 12, d: 30 })).toBe(false);
	});

	it('accepts day-30 in a 30-day month (2024 二月有三十)', () => {
		expect(isValidLunarDate({ y: 2024, m: 2, d: 30 })).toBe(true);
	});

	it('rejects out-of-range month/day', () => {
		expect(isValidLunarDate({ y: 2024, m: 0, d: 1 })).toBe(false);
		expect(isValidLunarDate({ y: 2024, m: 13, d: 1 })).toBe(false);
		expect(isValidLunarDate({ y: 2024, m: 1, d: 0 })).toBe(false);
		expect(isValidLunarDate({ y: 2024, m: 1, d: 31 })).toBe(false);
	});
});
