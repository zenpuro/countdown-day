/**
 * Compact lunar calendar table and conversions (lunar years 1895-2105).
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
export const LUNAR_TABLE_FIRST_YEAR = 1895;

/** Last lunar year covered by the table. */
export const LUNAR_TABLE_LAST_YEAR = 2105;

/** Base date: the solar date of lunar 1895 new year's day. */
export const TABLE_BASE_SOLAR = { y: 1895, m: 1, d: 26 };

const MS_PER_DAY = 86_400_000;

export const LUNAR_TABLE: readonly number[] = [
	0x0aa95, 0x00a97, 0x00556, 0x06ab5, 0x00ad5, 0x116d2, 0x00752, 0x00ea5, 0x0b64a, 0x0064b, 0x00a9b, 0x09556,
	0x0056a, 0x00b59, 0x05752, 0x00752, 0x0db25, 0x00b25, 0x00a4b, 0x0b4ab, 0x002ad, 0x0056b, 0x04b69, 0x00da9,
	0x0fd92, 0x00e92, 0x00d25, 0x0ba4d, 0x00a56, 0x002b6, 0x095b5, 0x006d4, 0x00ea9, 0x05e92, 0x00e92, 0x0cd26,
	0x0052b, 0x00a57, 0x0b2b6, 0x00b5a, 0x006d4, 0x06ec9, 0x00749, 0x0f693, 0x00a93, 0x0052b, 0x0ca5b, 0x00aad,
	0x0056a, 0x09b55, 0x00ba4, 0x00b49, 0x05a93, 0x00a95, 0x0f52d, 0x00536, 0x00aad, 0x0b5aa, 0x005b2, 0x00da5,
	0x07d4a, 0x00d4a, 0x10a95, 0x00a97, 0x00556, 0x0cab5, 0x00ad5, 0x006d2, 0x08ea5, 0x00ea5, 0x0064a, 0x06c97,
	0x00a9b, 0x0f55a, 0x0056a, 0x00b69, 0x0b752, 0x00b52, 0x00b25, 0x0964b, 0x00a4b, 0x114ab, 0x002ad, 0x0056d,
	0x0cb69, 0x00da9, 0x00d92, 0x09d25, 0x00d25, 0x15a4d, 0x00a56, 0x002b6, 0x0c5b5, 0x006d5, 0x00ea9, 0x0be92,
	0x00e92, 0x00d26, 0x06a56, 0x00a57, 0x114d6, 0x0035a, 0x006d5, 0x0b6c9, 0x00749, 0x00693, 0x0952b, 0x0052b,
	0x00a5b, 0x0555a, 0x0056a, 0x0fb55, 0x00ba4, 0x00b49, 0x0ba93, 0x00a95, 0x0052d, 0x08aad, 0x00ab5, 0x135aa,
	0x005d2, 0x00da5, 0x0dd4a, 0x00d4a, 0x00c95, 0x0952e, 0x00556, 0x00ab5, 0x055b2, 0x006d2, 0x0cea5, 0x00725,
	0x0064b, 0x0ac97, 0x00cab, 0x0055a, 0x06ad6, 0x00b69, 0x17752, 0x00b52, 0x00b25, 0x0da4b, 0x00a4b, 0x004ab,
	0x0a55b, 0x005ad, 0x00b6a, 0x05b52, 0x00d92, 0x0fd25, 0x00d25, 0x00a55, 0x0b4ad, 0x004b6, 0x005b5, 0x06daa,
	0x00ec9, 0x11e92, 0x00e92, 0x00d26, 0x0ca56, 0x00a57, 0x004d6, 0x086d5, 0x00755, 0x00749, 0x06e93, 0x00693,
	0x0f52b, 0x0052b, 0x00a5b, 0x0b55a, 0x0056a, 0x00b65, 0x0974a, 0x00b4a, 0x11a95, 0x00a95, 0x0052d, 0x0caad,
	0x00ab5, 0x005aa, 0x08ba5, 0x00da5, 0x00d4a, 0x07c95, 0x00c96, 0x0f94e, 0x00556, 0x00ab5, 0x0b5b2, 0x006d2,
	0x00ea5, 0x08e4a, 0x0068b, 0x10c97, 0x004ab, 0x0055b, 0x0cad6, 0x00b6a, 0x00752, 0x09725, 0x00b45, 0x00a8b,
	0x0549b, 0x004ab, 0x0e95b, 0x005ad, 0x00baa, 0x0bb52, 0x00d92,
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
