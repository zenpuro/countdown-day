import {
	tableLunarToSolar,
	tableLeapMonth,
	tableMonthDays,
	tableSolarToLunar,
} from './lunar-table';

/**
 * Pure-function date engine: computes a countdown event's next occurrence
 * and remaining days for both solar and lunar (Chinese) calendars.
 *
 * Boundary rules are frozen in SPEC-date-engine.md (v1). Zero Obsidian
 * imports — the lunar library is only touched here, so it can be swapped
 * by changing this module's internals alone.
 */

export type CalendarType = 'solar' | 'lunar';
/**
 * Repeat rules (schema v1.2):
 * - `none` / `yearly`: date-anniversary semantics (lunar-aware)
 * - `daily` / `weekdays` / `weekly` / `custom`: absolute-day recurrences
 *   (a lunar anchor is converted to solar first; calendar is irrelevant)
 * - `monthly`: solar → same day each solar month (clamped); lunar → same
 *   lunar day each lunar month (day 30 clamps to 廿九 in 29-day months)
 * - `custom`: every `repeatEvery` days (interval, default 1)
 */
export type RepeatRule =
	| 'none'
	| 'daily'
	| 'weekdays'
	| 'weekly'
	| 'monthly'
	| 'yearly'
	| 'custom';

/** All valid frontmatter `repeat` values (parser allow-list). */
export const REPEAT_RULES: readonly RepeatRule[] = [
	'none',
	'daily',
	'weekdays',
	'weekly',
	'monthly',
	'yearly',
	'custom',
];
export type EventType = 'countdown' | 'anniversary' | 'birthday';

export interface EventDateInput {
	y: number;
	m: number;
	d: number;
	leapMonth?: boolean;
}

export interface OccurrenceResult {
	/** Next occurrence at local midnight; null when repeat=none and the date has passed. */
	next: Date | null;
	/** Whole days relative to today: positive = future, 0 = today, negative = N days ago. */
	daysUntil: number;
}

/** A calendar date as local-midnight components. */
interface SolarYmd {
	y: number;
	m: number;
	d: number;
}

function toLocalDate(s: SolarYmd): Date {
	return new Date(s.y, s.m - 1, s.d);
}

function midnightOf(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole-day difference to→from, DST-safe via UTC projection of local dates. */
function diffDays(from: Date, to: Date): number {
	const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
	const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
	return Math.round((b - a) / 86_400_000);
}

function isLeapYear(y: number): boolean {
	return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Solar anniversary candidate for `year`; 2/29 events fall back to 2/28 in common years. */
function solarCandidate(year: number, date: EventDateInput): SolarYmd {
	const d = date.m === 2 && date.d === 29 && !isLeapYear(year) ? 28 : date.d;
	return { y: year, m: date.m, d };
}

/**
 * Resolve a lunar event date inside `lunarYear`, applying the frozen fallbacks:
 * - event month is leap X but the year has no leap X → normal month X
 * - event day is 30 but the month has only 29 days → day 29
 */
function resolveLunar(lunarYear: number, date: EventDateInput): SolarYmd {
	const yearLeap = tableLeapMonth(lunarYear);
	const month =
		date.leapMonth === true && yearLeap === date.m ? -date.m : date.m;
	const dayCount = tableMonthDays(lunarYear, month);
	const day = Math.min(date.d, dayCount);
	return tableLunarToSolar(lunarYear, month, day);
}

/** Day count (29/30/31) of a solar month. */
function solarMonthDays(y: number, m: number): number {
	return new Date(y, m, 0).getDate();
}

/** Solar month index → {y, m} (m 1–12), rolling over years. */
function normalizeMonth(y: number, m: number): { y: number; m: number } {
	const total = y * 12 + (m - 1);
	return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/** Add whole days to a local-midnight date (constructor handles overflow). */
function addDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** First weekday (Mon–Fri) at or after `start`. */
function nextWeekday(start: Date): Date {
	let cursor = start;
	for (let i = 0; i < 7 && (cursor.getDay() === 0 || cursor.getDay() === 6); i++) {
		cursor = addDays(cursor, 1);
	}
	return cursor;
}

/**
 * Compute the next occurrence of an event and the day count relative to `today`.
 * All comparisons are local-timezone at day granularity. Repeating events
 * always have a `next`; only `repeat: none` can expire (next = null).
 */
export function nextOccurrence(
	input: {
		date: EventDateInput;
		calendar: CalendarType;
		repeat: RepeatRule;
		/** Interval in days for `repeat: 'custom'`; invalid values clamp to 1. */
		repeatEvery?: number;
	},
	today: Date,
): OccurrenceResult {
	const todayMid = midnightOf(today);

	// The anchor as a solar local-midnight date (lunar → converted, with fallbacks).
	const anchor =
		input.calendar === 'lunar'
			? toLocalDate(resolveLunar(input.date.y, input.date))
			: toLocalDate(input.date);

	if (input.repeat === 'none') {
		const days = diffDays(todayMid, anchor);
		return { next: days >= 0 ? anchor : null, daysUntil: days };
	}

	if (input.repeat === 'yearly') {
		// scan candidate years starting from today's (lunar) year.
		// Two lookaheads always suffice; the loop bound is defensive only.
		let year =
			input.calendar === 'lunar'
				? solarToLunar(todayMid).y
				: todayMid.getFullYear();
		let next = toLocalDate(
			input.calendar === 'lunar'
				? resolveLunar(year, input.date)
				: solarCandidate(year, input.date),
		);
		for (let i = 0; i < 3 && next < todayMid; i++) {
			year += 1;
			next = toLocalDate(
				input.calendar === 'lunar'
				? resolveLunar(year, input.date)
				: solarCandidate(year, input.date),
			);
		}
		return { next, daysUntil: diffDays(todayMid, next) };
	}

	// Day-based recurrences: occurrences are anchor + k·interval (k ≥ 0).
	const dayBasedNext = (interval: number): Date => {
		const diff = diffDays(anchor, todayMid); // anchor → today
		if (diff <= 0) return anchor;
		const k = Math.ceil(diff / interval);
		return addDays(anchor, k * interval);
	};

	let next: Date;
	switch (input.repeat) {
		case 'daily':
			next = dayBasedNext(1);
			break;
		case 'custom': {
			const n = Number.isFinite(input.repeatEvery) && input.repeatEvery! >= 1
				? Math.floor(input.repeatEvery!)
				: 1;
			next = dayBasedNext(n);
			break;
		}
		case 'weekdays':
			next = nextWeekday(anchor > todayMid ? anchor : todayMid);
			break;
		case 'weekly':
			next = dayBasedNext(7);
			break;
		case 'monthly':
			next = nextMonthly(input, anchor, todayMid);
			break;
		default:
			next = anchor;
	}

	return { next, daysUntil: diffDays(todayMid, next) };
}

/**
 * Monthly recurrence. Solar: same day each month, clamped to the month
 * length (31st → 30th in 30-day months). Lunar: same lunar day each lunar
 * month, day 30 clamping to 廿九 in 29-day months.
 */
function nextMonthly(
	input: { date: EventDateInput; calendar: CalendarType },
	anchor: Date,
	todayMid: Date,
): Date {
	if (input.calendar === 'solar') {
		const start = anchor > todayMid ? anchor : todayMid;
		let { y, m } = { y: start.getFullYear(), m: start.getMonth() + 1 };
		for (let i = 0; i < 25; i++) {
			const norm = normalizeMonth(y, m + i);
			const candidate = toLocalDate({
				y: norm.y,
				m: norm.m,
				d: Math.min(input.date.d, solarMonthDays(norm.y, norm.m)),
			});
			if (candidate >= todayMid) return candidate;
		}
		return anchor; // unreachable: some month within 25 always qualifies
	}

	// Lunar monthly: walk solar days from max(anchor, today) until the lunar
	// day matches (day-30 events match the last day of shorter months).
	let cursor = anchor > todayMid ? anchor : todayMid;
	for (let i = 0; i < 45; i++) {
		const lunar = tableSolarToLunar(
			cursor.getFullYear(),
			cursor.getMonth() + 1,
			cursor.getDate(),
		);
		const monthDays = tableMonthDays(lunar.y, lunar.month);
		if (
			lunar.day === input.date.d ||
			(input.date.d > monthDays && lunar.day === monthDays)
		) {
			return cursor;
		}
		cursor = addDays(cursor, 1);
	}
	return anchor; // unreachable: a match always occurs within one lunar month
}

/** Convert a lunar date to its solar equivalent (with frozen fallbacks). */
export function lunarToSolar(date: EventDateInput): Date {
	return toLocalDate(resolveLunar(date.y, date));
}

/** Convert a solar date to its lunar equivalent. */
export function solarToLunar(date: Date): {
	y: number;
	m: number;
	d: number;
	leapMonth: boolean;
} {
	const lunar = tableSolarToLunar(
		date.getFullYear(),
		date.getMonth() + 1,
		date.getDate(),
	);
	return {
		y: lunar.y,
		m: Math.abs(lunar.month),
		d: lunar.day,
		leapMonth: lunar.month < 0,
	};
}

/** Leap month number of a lunar year (0 = no leap month). */
export function lunarLeapMonth(lunarYear: number): number {
	return tableLeapMonth(lunarYear);
}

/** Day count (29 or 30) of a lunar month; leap months via leapMonth=true. */
export function lunarMonthDays(
	lunarYear: number,
	month: number,
	leapMonth?: boolean,
): number {
	const m = leapMonth === true ? -month : month;
	return tableMonthDays(lunarYear, m);
}

/**
 * Strict validation of a lunar date *definition*: the leap month must really
 * exist that year and the day must not exceed the month's actual day count.
 * Unlike nextOccurrence's tolerant fallbacks, an invalid definition is false.
 */
export function isValidLunarDate(input: EventDateInput): boolean {
	if (
		!Number.isInteger(input.y) ||
		!Number.isInteger(input.m) ||
		!Number.isInteger(input.d)
	) {
		return false;
	}
	if (input.m < 1 || input.m > 12 || input.d < 1 || input.d > 30) {
		return false;
	}
	if (input.leapMonth === true && lunarLeapMonth(input.y) !== input.m) {
		return false;
	}
	const month = input.leapMonth === true ? -input.m : input.m;
	return input.d <= tableMonthDays(input.y, month);
}
