/**
 * 一次性生成器：从 lunar-javascript 提取紧凑农历年表，产出完整的
 * src/date-engine/lunar-table.ts（数据 + 换算函数）。仅开发期使用，
 * 不进入插件产物。
 *
 * 用法：node scripts/gen-lunar-table.mjs [起始农历年] [结束农历年]
 * 默认 1895–2105（UI 限制 1900–2100，前后各留余量）。
 *
 * 每年打包为一个整数：bit 13-16 = 闰月号（0 = 无闰月），
 * bit 0-12 按时间顺序存放各月大小（1 = 30 天）：依次为正月、二月、…、
 * 闰月插在其同号正常月之后（无闰月时共 12 位，有闰月时共 13 位）。
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LunarYear, Lunar } from 'lunar-javascript';

const from = Number(process.argv[2] ?? 1895);
const to = Number(process.argv[3] ?? 2105);

const entries = [];
for (let y = from; y <= to; y++) {
	const ly = LunarYear.fromYear(y);
	const leap = ly.getLeapMonth();
	const months = ly.getMonthsInYear(); // 按时间顺序，含闰月
	if (months.length !== (leap > 0 ? 13 : 12)) {
		throw new Error(`lunar year ${y}: unexpected month count ${months.length}`);
	}
	let bits = 0;
	months.forEach((m, i) => {
		if (m.getDayCount() === 30) bits |= 1 << i;
	});
	entries.push((leap << 13) | bits);
}

// 基准日：起始农历年的正月初一（公历）
const base = Lunar.fromYmd(from, 1, 1).getSolar();

const rows = [];
for (let i = 0; i < entries.length; i += 12) {
	const row = entries
		.slice(i, i + 12)
		.map((e) => `0x${e.toString(16).padStart(5, '0')}`);
	rows.push('\t' + row.join(', ') + ',');
}

const out = `/**
 * Compact lunar calendar table and conversions (lunar years ${from}-${to}).
 * Data is extracted from lunar-javascript by scripts/gen-lunar-table.mjs —
 * do not edit by hand; rerun the generator to refresh. Replaces the whole
 * library bundle (~330KB -> ~3KB).
 *
 * One integer per year: bits 13-16 = leap month number (0 = none); bits 0-12
 * mark each month's length in chronological order (1 = 30 days), with the
 * leap month right after its regular month. Out-of-range inputs clamp to the
 * table edges (the UI picker is limited to 1900-2100).
 */

/** First lunar year covered by the table. */
export const LUNAR_TABLE_FIRST_YEAR = ${from};

/** Last lunar year covered by the table. */
export const LUNAR_TABLE_LAST_YEAR = ${to};

/** Base date: the solar date of lunar ${from} new year's day. */
export const TABLE_BASE_SOLAR = { y: ${base.getYear()}, m: ${base.getMonth()}, d: ${base.getDay()} };

const MS_PER_DAY = 86_400_000;

export const LUNAR_TABLE: readonly number[] = [
${rows.join('\n')}
];

function clampYear(y: number): number {
	return Math.min(Math.max(y, LUNAR_TABLE_FIRST_YEAR), LUNAR_TABLE_LAST_YEAR);
}

function yearInfo(y: number): number {
	return LUNAR_TABLE[clampYear(y) - LUNAR_TABLE_FIRST_YEAR];
}

/** Leap month number of a lunar year (0 = none). */
export function tableLeapMonth(lunarYear: number): number {
	return yearInfo(lunarYear) >> 13;
}

/** Day count (29/30) of a lunar month; a negative month means the leap month. */
export function tableMonthDays(lunarYear: number, month: number): number {
	const info = yearInfo(lunarYear);
	const leap = info >> 13;
	// Bit order is chronological: months before the leap month sit at
	// position month-1, later ones shift by one.
	const pos =
		month < 0 ? -month : leap > 0 && month > leap ? month : month - 1;
	return (info >> pos) & 1 ? 30 : 29;
}

/** Day offsets of each lunar year's new year from the base (lazy cache; last entry is the end sentinel). */
let yearStartCache: number[] | null = null;

/** Total days of a lunar year (353-385). */
function lunarYearDays(y: number): number {
	const info = yearInfo(y);
	const months = info >> 13 ? 13 : 12;
	let days = 0;
	for (let pos = 0; pos < months; pos++) days += (info >> pos) & 1 ? 30 : 29;
	return days;
}

function yearStarts(): readonly number[] {
	if (!yearStartCache) {
		const starts: number[] = [0];
		for (let y = LUNAR_TABLE_FIRST_YEAR; y <= LUNAR_TABLE_LAST_YEAR; y++) {
			starts.push(starts[starts.length - 1] + lunarYearDays(y));
		}
		yearStartCache = starts;
	}
	return yearStartCache;
}

/** Day offset -> solar y/m/d (UTC projection; no timezone/DST interference). */
function dateFromDayNumber(n: number): { y: number; m: number; d: number } {
	const t = new Date(
		Date.UTC(TABLE_BASE_SOLAR.y, TABLE_BASE_SOLAR.m - 1, TABLE_BASE_SOLAR.d) +
			n * MS_PER_DAY,
	);
	return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Solar y/m/d -> day offset from the base. */
function dayNumberOf(y: number, m: number, d: number): number {
	return Math.round(
		(Date.UTC(y, m - 1, d) -
			Date.UTC(TABLE_BASE_SOLAR.y, TABLE_BASE_SOLAR.m - 1, TABLE_BASE_SOLAR.d)) /
			MS_PER_DAY,
	);
}

/** Lunar -> solar. A negative month means the leap month; 'day' must not exceed the month length (caller clamps). */
export function tableLunarToSolar(
	lunarYear: number,
	month: number,
	day: number,
): { y: number; m: number; d: number } {
	const y = clampYear(lunarYear);
	const info = yearInfo(y);
	const leap = info >> 13;
	const monthsBefore =
		month < 0 ? -month : month - 1 + (leap > 0 && leap < month ? 1 : 0);
	let offset = 0;
	for (let pos = 0; pos < monthsBefore; pos++) {
		offset += (info >> pos) & 1 ? 30 : 29;
	}
	return dateFromDayNumber(yearStarts()[y - LUNAR_TABLE_FIRST_YEAR] + offset + day - 1);
}

/** Solar -> lunar. A negative month means the leap month; out-of-range solar dates clamp to the table coverage. */
export function tableSolarToLunar(
	y: number,
	m: number,
	d: number,
): { y: number; month: number; day: number } {
	const starts = yearStarts();
	const n = Math.min(
		Math.max(dayNumberOf(y, m, d), 0),
		starts[starts.length - 1] - 1,
	);
	// Binary-search the lunar year: the last new year at or before 'n'
	// (the trailing sentinel entry is excluded).
	let lo = 0;
	let hi = starts.length - 2;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= n) lo = mid;
		else hi = mid - 1;
	}
	const lunarYear = LUNAR_TABLE_FIRST_YEAR + lo;
	const info = yearInfo(lunarYear);
	const leap = info >> 13;
	let rest = n - starts[lo];
	let pos = 0;
	while (rest >= ((info >> pos) & 1 ? 30 : 29)) {
		rest -= (info >> pos) & 1 ? 30 : 29;
		pos++;
	}
	// 时间序位号 → 月份号：闰月位返回负月号
	const month = leap > 0 ? (pos === leap ? -pos : pos < leap ? pos + 1 : pos) : pos + 1;
	return { y: lunarYear, month, day: rest + 1 };
}
`;

const target = join(
	dirname(fileURLToPath(import.meta.url)),
	'../src/date-engine/lunar-table.ts',
);
writeFileSync(target, out);
console.log(
	`wrote ${target}: lunar years ${from}-${to}, base ${base.toYmd()}, ${
		entries.length
	} entries`,
);
