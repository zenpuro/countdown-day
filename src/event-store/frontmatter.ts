import type { CalendarType, EventType, RepeatRule } from '../date-engine/date-engine';

/** Input for creating/updating an event file (already validated by the form layer). */
export interface EventInput {
	type: EventType;
	date: string; // yyyy-MM-dd
	calendar: CalendarType;
	repeat: RepeatRule;
	/** Interval in days; only emitted for `repeat: 'custom'`. */
	repeatEvery?: number;
	leapMonth?: boolean;
	note?: string;
	/** Days ahead to notify (sorted unique); empty/undefined = off. */
	remind?: number[];
}

/**
 * Build the YAML-ready frontmatter fields for an event. Only known schema v1
 * keys are emitted — unknown/user-written keys in existing files are never
 * touched, so they survive every read/write cycle.
 */
export function frontmatterFor(input: EventInput): Record<string, unknown> {
	const fm: Record<string, unknown> = {
		type: input.type,
		date: input.date,
		calendar: input.calendar,
		repeat: input.repeat,
	};
	if (input.repeat === 'custom') {
		// integer ≥ 1, defensive clamp for programmatic callers
		const n = Math.floor(input.repeatEvery ?? 1);
		fm['repeat-every'] = n >= 1 ? n : 1;
	}
	if (input.calendar === 'lunar' && input.leapMonth === true) {
		fm['leap-month'] = true;
	}
	if (input.note !== undefined && input.note !== '') fm['note'] = input.note;
	// single value stays a scalar (schema-compatible with v1 readers), multi → array
	if (input.remind !== undefined && input.remind.length > 0) {
		const days = [...new Set(input.remind)].sort((a, b) => a - b);
		fm['remind'] = days.length === 1 ? days[0] : days;
	}
	return fm;
}

/**
 * Apply an event to an existing frontmatter record the same way the store's
 * `processFrontMatter` callback does: known keys are overwritten in place,
 * everything else belongs to the user and stays.
 */
export function applyEventToRecord(
	record: Record<string, unknown>,
	input: EventInput,
): void {
	Object.assign(record, frontmatterFor(input));
	// drop a stale plugin-owned interval when the event no longer repeats custom
	if (input.repeat !== 'custom') delete record['repeat-every'];
	// drop the reminder when every day was unchecked
	if (input.remind === undefined || input.remind.length === 0) delete record['remind'];
	// drop the linked note when cleared in the form — omitting the key must
	// delete it, or a cleared note silently survives the save
	if (input.note === undefined || input.note === '') delete record['note'];
}

/** Replace filesystem-illegal characters so the event name can become a file name. */
export function sanitizeFileName(name: string): string {
	const cleaned = name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
	return cleaned.length > 0 ? cleaned : 'untitled';
}

/** Return a file name (without .md) not colliding with `existing`. */
export function dedupeFileName(name: string, existing: ReadonlySet<string>): string {
	if (!existing.has(name)) return name;
	for (let i = 2; i < 1000; i++) {
		const candidate = `${name} ${i}`;
		if (!existing.has(candidate)) return candidate;
	}
	throw new Error(`[countdown-day] cannot dedupe file name for "${name}"`);
}
