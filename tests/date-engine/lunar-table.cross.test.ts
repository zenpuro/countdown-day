import { describe, expect, it } from 'vitest';
import { Lunar, LunarMonth, LunarYear, Solar } from 'lunar-javascript';
import {
	lunarLeapMonth,
	lunarMonthDays,
	lunarToSolar,
	solarToLunar,
} from '../../src/date-engine/date-engine';
import {
	LUNAR_TABLE_FIRST_YEAR,
	LUNAR_TABLE_LAST_YEAR,
} from '../../src/date-engine/lunar-table';

/**
 * 与 lunar-javascript（农历数据的提取来源，devDependency）做全量交叉验证：
 * 表覆盖范围内（1895–2105）每一个农历日、闰月、月大小，以及选择器支持
 * 范围（1900–2100）内的每一个公历日，逐一比对，保证换库零行为差异。
 */

const FIRST = LUNAR_TABLE_FIRST_YEAR;
const LAST = LUNAR_TABLE_LAST_YEAR;

describe('lunar-table cross-validation vs lunar-javascript', () => {
	it('leap month and month day counts match for every lunar year', () => {
		for (let y = FIRST; y <= LAST; y++) {
			const libLeap = LunarYear.fromYear(y).getLeapMonth();
			expect(lunarLeapMonth(y), `leap month of ${y}`).toBe(libLeap);
			for (let m = 1; m <= 12; m++) {
				expect(lunarMonthDays(y, m), `month ${m} of ${y}`).toBe(
					LunarMonth.fromYm(y, m).getDayCount(),
				);
			}
		}
	}, 20_000);

	it('lunarToSolar matches for every valid lunar day (incl. leap months)', () => {
		for (let y = FIRST; y <= LAST; y++) {
			const leap = lunarLeapMonth(y);
			for (let m = 1; m <= 12; m++) {
				const months = leap === m ? [m, -m] : [m];
				for (const month of months) {
					const days = lunarMonthDays(y, month);
					for (let d = 1; d <= days; d++) {
						const mine = lunarToSolar({ y, m: month, d });
						const lib = Lunar.fromYmd(y, month, d).getSolar();
						expect(
							new Date(mine.getFullYear(), mine.getMonth(), mine.getDate()),
							`lunar ${y}/${month}/${d}`,
						).toStrictEqual(new Date(lib.getYear(), lib.getMonth() - 1, lib.getDay()));
					}
				}
			}
		}
	}, 60_000);

	it('solarToLunar matches for every solar day in the picker range (1900–2100)', () => {
		// Drive by day-number (UTC) so DST transitions can never skip a day
		const start = Date.UTC(1900, 0, 1);
		const end = Date.UTC(2100, 11, 31);
		for (let t = start; t <= end; t += 86_400_000) {
			const u = new Date(t);
			const y = u.getUTCFullYear();
			const m = u.getUTCMonth() + 1;
			const d = u.getUTCDate();
			const mine = solarToLunar(new Date(y, m - 1, d));
			const lib = Solar.fromYmd(y, m, d).getLunar();
			expect(
				{
					y: mine.y,
					m: mine.m,
					d: mine.d,
					leapMonth: mine.leapMonth,
				},
				`solar ${y}-${m}-${d}`,
			).toEqual({
				y: lib.getYear(),
				m: Math.abs(lib.getMonth()),
				d: lib.getDay(),
				leapMonth: lib.getMonth() < 0,
			});
		}
	}, 60_000);
});
