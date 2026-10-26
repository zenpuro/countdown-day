import type { CountdownEvent } from '../event-store/event';
import { occurrenceOf } from '../card-view/countdown-text';
import { t } from '../settings-i18n/i18n';

/**
 * Reminder semantics (SPEC-reminders.md): an event is due when daysUntil
 * is one of its selected remind days (exact match, schema v1.4 multi-remind)
 * and that (occurrence, day) pair hasn't been notified. State rolls with
 * occurrences — only records still relevant are kept.
 */

export interface NotifiedEntry {
	filePath: string;
	occurrenceISO: string;
	/** The remind day the notice fired for (0 = on the day). */
	daysUntil?: number;
}

export interface NotifiedState {
	notified: NotifiedEntry[];
}

export const EMPTY_NOTIFIED_STATE: NotifiedState = { notified: [] };

export interface DueNotice {
	event: CountdownEvent;
	/** The occurrence the notice is about (local midnight). */
	occurrence: Date;
	daysUntil: number;
}

export interface DueResult {
	notices: DueNotice[];
	newState: NotifiedState;
}

/** Compute due notices and the rolled dedup state. Pure — clock injected via `today`. */
export function dueNotifications(
	events: CountdownEvent[],
	today: Date,
	notifiedState: NotifiedState,
): DueResult {
	const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const alreadyNotified = new Set(
		notifiedState.notified.map(
			(entry) => `${entry.filePath}|${entry.occurrenceISO}|${entry.daysUntil ?? -1}`,
		),
	);

	const notices: DueNotice[] = [];
	const keptEntries: NotifiedEntry[] = [];

	for (const entry of notifiedState.notified) {
		// rolling cleanup: keep only entries for occurrences still today-or-later
		if (new Date(entry.occurrenceISO) >= todayMid) keptEntries.push(entry);
	}

	for (const event of events) {
		if (event.remind === undefined || event.remind.length === 0) continue;
		const occurrence = occurrenceOf(event, today);
		if (occurrence.next === null) continue; // expired repeat=none
		if (!event.remind.includes(occurrence.daysUntil)) continue;

		const entry: NotifiedEntry = {
			filePath: event.path,
			occurrenceISO: occurrence.next.toISOString(),
			daysUntil: occurrence.daysUntil,
		};
		if (alreadyNotified.has(`${entry.filePath}|${entry.occurrenceISO}|${entry.daysUntil}`)) {
			continue; // already notified for this occurrence/day pair
		}

		notices.push({ event, occurrence: occurrence.next, daysUntil: occurrence.daysUntil });
		keptEntries.push(entry);
	}

	return { notices, newState: { notified: keptEntries } };
}

export interface ReminderMessageInput {
	name: string;
	daysUntil: number;
	/** Lunar date string appended for lunar events. */
	lunarDate?: string;
}

/** Localized notification copy: 「妈妈生日」还有 3 天 / "Mom's birthday" in 3 days. */
export function reminderMessage(input: ReminderMessageInput): string {
	const base =
		input.daysUntil === 0
			? t('reminders.notify.today', { name: input.name })
			: t('reminders.notify.daysLeft', { name: input.name, n: input.daysUntil });
	if (input.lunarDate === undefined) return base;
	return `${base}${t('reminders.notify.lunarSuffix', { date: input.lunarDate })}`;
}
