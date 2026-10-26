import type { CalendarType, EventType, RepeatRule } from '../date-engine/date-engine';

/**
 * Normalized in-memory event (frontmatter schema v1.1, see SPEC-event-store.md).
 * `date` is stored as `yyyy-MM-dd` where m/d are calendar months/days
 * (for lunar events: lunar month incl. leap, lunar day).
 */
export interface CountdownEvent {
	/** Vault path — stable id, updated on rename. */
	path: string;
	/** File name without .md — the event's display name. */
	name: string;
	type: EventType;
	date: string;
	calendar: CalendarType;
	leapMonth: boolean;
	repeat: RepeatRule;
	/** Interval in days for `repeat: 'custom'` (integer ≥ 1). */
	repeatEvery?: number;
	/** Wikilink to a related note, e.g. "[[礼物清单]]". */
	note?: string;
	/** Days ahead to notify (each must fire on its exact day); undefined = off. */
	remind?: number[];
	/** Pinned to the top of the list (frontmatter `pinned: true`). */
	pinned?: boolean;
}

export const EVENT_TYPES: readonly EventType[] = [
	'countdown',
	'anniversary',
	'birthday',
];
