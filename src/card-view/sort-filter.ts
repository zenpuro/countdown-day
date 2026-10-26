import type { EventType } from '../date-engine/date-engine';
import type { CountdownEvent } from '../event-store/event';
import { occurrenceOf } from './countdown-text';

export type FilterTab = 'all' | EventType;

/**
 * Sort per SPEC-card-view.md: pinned events first (keeping daysUntil order
 * within the group); then daysUntil ascending (soonest first); expired
 * (repeat=none past) events sink to the bottom, most-recently-past first;
 * ties broken by event name.
 */
export function sortEvents(
	events: CountdownEvent[],
	today: Date = new Date(),
): CountdownEvent[] {
	const keyed = events.map((event) => ({ event, occ: occurrenceOf(event, today) }));
	keyed.sort((a, b) => {
		const aPinned = a.event.pinned === true;
		const bPinned = b.event.pinned === true;
		if (aPinned !== bPinned) return aPinned ? -1 : 1;
		const aExpired = a.occ.next === null;
		const bExpired = b.occ.next === null;
		if (aExpired !== bExpired) return aExpired ? 1 : -1;
		if (aExpired && bExpired) {
			// both past: most recently past first
			if (a.occ.daysUntil !== b.occ.daysUntil) {
				return b.occ.daysUntil - a.occ.daysUntil;
			}
		} else if (a.occ.daysUntil !== b.occ.daysUntil) {
			return a.occ.daysUntil - b.occ.daysUntil;
		}
		return a.event.name.localeCompare(b.event.name);
	});
	return keyed.map(({ event }) => event);
}

/** Three-way type filter (全部 / 倒计时 / 纪念日 / 生日). */
export function filterEvents(events: CountdownEvent[], tab: FilterTab): CountdownEvent[] {
	return tab === 'all' ? [...events] : events.filter((event) => event.type === tab);
}
