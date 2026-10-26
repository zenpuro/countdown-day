import { afterEach, describe, expect, it } from 'vitest';
import {
	dueNotifications,
	type NotifiedEntry,
	type NotifiedState,
	reminderMessage,
} from '../../src/reminders/reminders';
import type { CountdownEvent } from '../../src/event-store/event';
import { setLocale } from '../../src/settings-i18n/i18n';

const TODAY = new Date(2025, 9, 16); // 2025-10-16

const ev = (overrides: Partial<CountdownEvent>): CountdownEvent => ({
	path: `Countdowns/${overrides.name ?? 'event'}.md`,
	name: 'event',
	type: 'countdown',
	date: '2030-01-01',
	calendar: 'solar',
	leapMonth: false,
	repeat: 'none',
	...overrides,
});

const state = (
	...entries: Array<Pick<NotifiedEntry, 'filePath' | 'occurrenceISO'> & Partial<NotifiedEntry>>
): NotifiedState => ({ notified: [...entries] });

const iso = (y: number, m: number, d: number): string =>
	new Date(y, m - 1, d).toISOString();

afterEach(() => setLocale('en'));

describe('dueNotifications — exact-day trigger (schema v1.4)', () => {
	it('notifies on the exact selected day (remind [3], daysUntil 3)', () => {
		const result = dueNotifications(
			[ev({ name: 'mom', date: '2025-10-19', repeat: 'yearly', remind: [3] })],
			TODAY,
			state(),
		);

		expect(result.notices).toHaveLength(1);
		expect(result.notices[0].event.name).toBe('mom');
		expect(result.notices[0].daysUntil).toBe(3);
	});

	it('does not notify on unselected days inside the old window (remind [3], daysUntil 2)', () => {
		const result = dueNotifications(
			[ev({ name: 'soon', date: '2025-10-18', repeat: 'yearly', remind: [3] })],
			TODAY,
			state(),
		);

		expect(result.notices).toHaveLength(0);
	});

	it('notifies on the day itself (remind [0], daysUntil 0)', () => {
		const result = dueNotifications(
			[ev({ name: 'today', date: '2025-10-16', repeat: 'yearly', remind: [0] })],
			TODAY,
			state(),
		);

		expect(result.notices).toHaveLength(1);
		expect(result.notices[0].daysUntil).toBe(0);
	});

	it('multi-remind notifies each selected day once (remind [0, 3])', () => {
		const event = ev({ name: 'mom', date: '2025-10-19', repeat: 'yearly', remind: [0, 3] });

		const day3 = dueNotifications([event], TODAY, state());
		expect(day3.notices.map((n) => n.daysUntil)).toEqual([3]);

		// three days later the on-the-day reminder fires as a separate notice
		const day0 = dueNotifications(
			[event],
			new Date(2025, 9, 19),
			day3.newState,
		);
		expect(day0.notices.map((n) => n.daysUntil)).toEqual([0]);
	});

	it('never notifies events without remind', () => {
		const result = dueNotifications(
			[ev({ name: 'plain', date: '2025-10-17', repeat: 'yearly' })],
			TODAY,
			state(),
		);

		expect(result.notices).toHaveLength(0);
	});

	it('never notifies expired repeat=none events', () => {
		const result = dueNotifications(
			[ev({ name: 'gone', date: '2025-10-10', repeat: 'none', remind: [30] })],
			TODAY,
			state(),
		);

		expect(result.notices).toHaveLength(0);
	});

	it('lunar events use their converted occurrence (中秋 exactly 5 days out)', () => {
		const moon = () =>
			ev({
				name: '中秋',
				type: 'anniversary',
				date: '2025-08-15',
				calendar: 'lunar',
				repeat: 'yearly',
				remind: [5],
			});

		const far = dueNotifications([moon()], new Date(2026, 7, 11), state());
		const exact = dueNotifications([moon()], new Date(2026, 8, 20), state()); // 2026-09-25 minus 5

		expect(far.notices).toHaveLength(0);
		expect(exact.notices).toHaveLength(1);
		expect(exact.notices[0].daysUntil).toBe(5);
	});
});

describe('dueNotifications — dedup & state rolling', () => {
	const event = ev({ name: 'mom', date: '2025-10-19', repeat: 'yearly', remind: [3] });

	it('does not repeat an (occurrence, day) pair already notified', () => {
		const result = dueNotifications(
			[event],
			TODAY,
			state({ filePath: event.path, occurrenceISO: iso(2025, 10, 19), daysUntil: 3 }),
		);

		expect(result.notices).toHaveLength(0);
		expect(result.newState.notified).toHaveLength(1);
	});

	it('notifies the next occurrence of the same event (new year)', () => {
		const result = dueNotifications(
			[event],
			new Date(2026, 9, 16), // 2026-10-16 → occurrence 2026-10-19
			state({ filePath: event.path, occurrenceISO: iso(2025, 10, 19), daysUntil: 3 }),
		);

		expect(result.notices).toHaveLength(1);
		expect(result.notices[0].daysUntil).toBe(3);
		expect(result.newState.notified).toContainEqual({
			filePath: event.path,
			occurrenceISO: iso(2026, 10, 19),
			daysUntil: 3,
		});
	});

	it('records new notifications in newState with their day', () => {
		const result = dueNotifications([event], TODAY, state());

		expect(result.newState.notified).toEqual([
			{ filePath: event.path, occurrenceISO: iso(2025, 10, 19), daysUntil: 3 },
		]);
	});

	it('cleans entries for occurrences that already passed (no unbounded growth)', () => {
		const trip = ev({ name: 'trip', date: '2025-10-19', repeat: 'yearly', remind: [3] });

		const result = dueNotifications(
			[event, trip],
			TODAY,
			state(
				{ filePath: 'Countdowns/old.md', occurrenceISO: iso(2025, 10, 1) }, // passed
				{ filePath: event.path, occurrenceISO: iso(2025, 10, 19), daysUntil: 3 }, // already fired
			),
		);

		const paths = result.newState.notified.map((n) => n.filePath);
		expect(paths).not.toContain('Countdowns/old.md');
		expect(paths).toContain(event.path); // kept (already notified, still current)
		expect(paths).toContain(trip.path); // newly notified
		expect(result.notices.map((n) => n.event.name)).toEqual(['trip']);
	});
});

describe('reminderMessage', () => {
	it('en: days left / today', () => {
		expect(reminderMessage({ name: 'Mom’s birthday', daysUntil: 3 })).toBe(
			'"Mom’s birthday" in 3 days',
		);
		expect(reminderMessage({ name: 'Spring Festival', daysUntil: 0 })).toBe(
			'"Spring Festival" today',
		);
	});

	it('zh: 还有 N 天 / 今天', () => {
		setLocale('zh');
		expect(reminderMessage({ name: '妈妈生日', daysUntil: 3 })).toBe(
			'「妈妈生日」还有 3 天',
		);
		expect(reminderMessage({ name: '春节', daysUntil: 0 })).toBe('「春节」今天');
	});

	it('appends the lunar suffix for lunar events', () => {
		setLocale('zh');
		expect(
			reminderMessage({ name: '春节', daysUntil: 3, lunarDate: '2026-01-01' }),
		).toBe('「春节」还有 3 天（农历 2026-01-01）');
	});
});
