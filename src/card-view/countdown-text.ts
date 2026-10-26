import type { CalendarType, RepeatRule } from '../date-engine/date-engine';
import { nextOccurrence, type OccurrenceResult } from '../date-engine/date-engine';
import type { CountdownEvent } from '../event-store/event';
import { t } from '../settings-i18n/i18n';

/** Parse an event's stored `yyyy-MM-dd` into engine input. */
export function occurrenceOf(event: CountdownEvent, today: Date): OccurrenceResult {
	const [y, m, d] = event.date.split('-').map(Number);
	return nextOccurrence(
		{
			date: { y, m, d, leapMonth: event.leapMonth },
			calendar: event.calendar as CalendarType,
			repeat: event.repeat as RepeatRule,
			...(event.repeat === 'custom' && event.repeatEvery !== undefined
				? { repeatEvery: event.repeatEvery }
				: {}),
		},
		today,
	);
}

/**
 * Occurrence for row display. Anniversaries (纪念日) count UP from the
 * original date once it has passed — 已经 N 天 with the stored date, like
 * the reference apps — instead of rolling to the next yearly occurrence
 * (which would show a future year). Future anniversaries and every other
 * type are unchanged.
 */
export function cardOccurrence(event: CountdownEvent, today: Date): OccurrenceResult {
	const occurrence = occurrenceOf(event, today);
	if (event.type !== 'anniversary') return occurrence;
	const asFixed = occurrenceOf({ ...event, repeat: 'none' }, today);
	// past anchor → next = null, negative daysUntil → 已经 N 天 + stored date
	return asFixed.daysUntil < 0 ? asFixed : occurrence;
}

export type CountdownKind = 'future' | 'today' | 'past';

/** Split countdown state for the row UI: prefix word (还有/今天/已经) + day count. */
export function countdownParts(occurrence: OccurrenceResult): {
	kind: CountdownKind;
	days: number | null;
} {
	if (occurrence.daysUntil > 0) return { kind: 'future', days: occurrence.daysUntil };
	if (occurrence.daysUntil === 0) return { kind: 'today', days: null };
	return { kind: 'past', days: -occurrence.daysUntil };
}

/** Localized prefix word for a countdown kind. */
export function countdownPrefix(kind: CountdownKind): string {
	return t(`card-view.prefix.${kind}` as never);
}
