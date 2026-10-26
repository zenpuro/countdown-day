import { isValidLunarDate, REPEAT_RULES, type CalendarType, type RepeatRule } from '../date-engine/date-engine';
import { EVENT_TYPES, type CountdownEvent } from './event';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse one file's frontmatter into a normalized event.
 * Tolerant per spec: invalid optional fields fall back to defaults with a
 * console.warn; unknown type (incl. the removed `festival`) or unusable date
 * excludes the file entirely. Unknown frontmatter fields — e.g. the legacy
 * `icon` key — are ignored here and never touched by writes.
 */
export function parseEventFile(
	path: string,
	frontmatter: unknown,
): CountdownEvent | null {
	if (frontmatter === null || frontmatter === undefined) {
		// no frontmatter at all → plain note, not an event; skip silently
		// (same policy as the full scan in EventStore.refresh — the folder may
		// hold ordinary notes, and new/empty files have no frontmatter yet)
		return null;
	}
	if (typeof frontmatter !== 'object') {
		console.warn(`[countdown-day] ${path}: no usable frontmatter, skipped`);
		return null;
	}
	const fm = frontmatter as Record<string, unknown>;
	const name = path.split('/').pop()!.replace(/\.md$/i, '');

	const type = fm['type'];
	if (typeof type !== 'string' || !EVENT_TYPES.includes(type as never)) {
		console.warn(`[countdown-day] ${path}: unknown type ${JSON.stringify(type)}, skipped`);
		return null;
	}

	const date = coerceDate(fm['date']);
	if (date === null) {
		console.warn(`[countdown-day] ${path}: missing/invalid date, skipped`);
		return null;
	}

	const calendar = parseEnum(fm['calendar'], ['solar', 'lunar'] as const, 'solar', path, 'calendar');
	const repeat = parseEnum(fm['repeat'], REPEAT_RULES, 'none', path, 'repeat');

	// custom interval: only meaningful (and parsed) with repeat=custom
	let repeatEvery: number | undefined;
	if (repeat === 'custom') {
		repeatEvery = coerceRepeatEvery(fm['repeat-every']);
		if (fm['repeat-every'] !== undefined && repeatEvery === undefined) {
			warnField(path, 'repeat-every', fm['repeat-every'], '1');
			repeatEvery = 1;
		}
	}

	let leapMonth = false;
	const rawLeap = fm['leap-month'];
	if (rawLeap !== undefined) {
		if (rawLeap === true || rawLeap === false) {
			leapMonth = rawLeap;
		} else {
			warnField(path, 'leap-month', rawLeap, 'false');
		}
	}

	// Calendar-aware date validation.
	const [y, m, d] = date.split('-').map(Number);
	if (calendar === 'lunar') {
		if (!isValidLunarDate({ y, m, d, leapMonth })) {
			if (leapMonth === true && isValidLunarDate({ y, m, d })) {
				// leap month doesn't exist that year → tolerate as normal month
				console.warn(
					`[countdown-day] ${path}: leap-month ${m} does not exist in lunar year ${y}, using normal month`,
				);
				leapMonth = false;
			} else {
				console.warn(`[countdown-day] ${path}: invalid lunar date ${date}, skipped`);
				return null;
			}
		}
	} else if (!isValidSolarDate(y, m, d)) {
		console.warn(`[countdown-day] ${path}: invalid solar date ${date}, skipped`);
		return null;
	}

	const noteRaw = fm['note'];
	let note: string | undefined;
	if (noteRaw !== undefined && noteRaw !== null && noteRaw !== '') {
		if (typeof noteRaw === 'string') note = noteRaw;
		else warnField(path, 'note', noteRaw, 'unset');
	}

	const remindRaw = fm['remind'];
	let remind: number[] | undefined;
	if (remindRaw !== undefined && remindRaw !== null) {
		remind = coerceRemindList(remindRaw);
		if (remind === undefined) {
			warnField(path, 'remind', remindRaw, 'unset');
		}
	}

	let pinned = false;
	const rawPinned = fm['pinned'];
	if (rawPinned !== undefined && rawPinned !== null) {
		if (rawPinned === true || rawPinned === false) {
			pinned = rawPinned;
		} else {
			warnField(path, 'pinned', rawPinned, 'false');
		}
	}

	return {
		path,
		name,
		type: type as CountdownEvent['type'],
		date,
		calendar,
		leapMonth,
		repeat,
		...(repeatEvery !== undefined ? { repeatEvery } : {}),
		...(note !== undefined ? { note } : {}),
		...(remind !== undefined ? { remind } : {}),
		...(pinned ? { pinned: true } : {}),
	};
}

function coerceDate(value: unknown): string | null {
	if (value instanceof Date) {
		const y = value.getFullYear();
		const m = String(value.getMonth() + 1).padStart(2, '0');
		const d = String(value.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	if (typeof value === 'string' && DATE_RE.test(value)) return value;
	return null;
}

function isValidSolarDate(y: number, m: number, d: number): boolean {
	if (m < 1 || m > 12) return false;
	const probe = new Date(y, m - 1, d);
	return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/**
 * Coerce `remind` frontmatter into a sorted, unique list of day offsets:
 * scalar (`remind: 3`), array (`remind: [1, 3]`) and numeric strings are all
 * accepted (schema v1.4). Returns undefined for empty/invalid input.
 */
function coerceRemindList(value: unknown): number[] | undefined {
	const raw = Array.isArray(value) ? value : [value];
	const days = new Set<number>();
	for (const item of raw) {
		let n: unknown = item;
		if (typeof n === 'string' && n.trim() !== '' && !Number.isNaN(Number(n))) {
			n = Number(n);
		}
		if (typeof n === 'number' && Number.isInteger(n) && n >= 0) days.add(n);
	}
	return days.size === 0 ? undefined : [...days].sort((a, b) => a - b);
}

function coerceRepeatEvery(value: unknown): number | undefined {
	let n: unknown = value;
	if (typeof n === 'string' && n.trim() !== '' && !Number.isNaN(Number(n))) {
		n = Number(n);
	}
	if (typeof n === 'number' && Number.isInteger(n) && n >= 1) return n;
	return undefined;
}

function parseEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
	path: string,
	field: string,
): T {
	if (value === undefined || value === null) return fallback;
	if (typeof value === 'string' && allowed.includes(value as T)) return value as T;
	warnField(path, field, value, fallback);
	return fallback;
}

function warnField(path: string, field: string, value: unknown, fallback: string): void {
	console.warn(
		`[countdown-day] ${path}: invalid ${field} ${JSON.stringify(value)}, using ${fallback}`,
	);
}
