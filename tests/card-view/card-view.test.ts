import { afterEach, describe, expect, it } from 'vitest';
import {
	cardOccurrence,
	countdownParts,
	countdownPrefix,
	occurrenceOf,
} from '../../src/card-view/countdown-text';
import {
	filterEvents,
	sortEvents,
	type FilterTab,
} from '../../src/card-view/sort-filter';
import { createEventCardEl, createEventRowEl } from '../../src/card-view/event-card';
import { setLocale } from '../../src/settings-i18n/i18n';
import type { CountdownEvent } from '../../src/event-store/event';

const TODAY = new Date(2025, 9, 16); // 2025-10-16

/** Event fixture with sensible overrides. */
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

afterEach(() => setLocale('en'));

describe('sortEvents', () => {
	it('sorts by daysUntil ascending (soonest first)', () => {
		const sorted = sortEvents(
			[
				ev({ name: 'far', date: '2026-06-01' }),
				ev({ name: 'near', date: '2025-10-20' }),
				ev({ name: 'mid', date: '2025-12-25' }),
			],
			TODAY,
		);

		expect(sorted.map((e) => e.name)).toEqual(['near', 'mid', 'far']);
	});

	it('sinks expired (repeat=none, past) events to the bottom', () => {
		const sorted = sortEvents(
			[
				ev({ name: 'expired', date: '2025-01-01' }),
				ev({ name: 'future', date: '2025-12-01' }),
			],
			TODAY,
		);

		expect(sorted.map((e) => e.name)).toEqual(['future', 'expired']);
	});

	it('breaks ties by name (same daysUntil)', () => {
		const sorted = sortEvents(
			[
				ev({ name: 'beta', date: '2025-12-25' }),
				ev({ name: 'alpha', date: '2025-12-25' }),
			],
			TODAY,
		);

		expect(sorted.map((e) => e.name)).toEqual(['alpha', 'beta']);
	});

	it('pins stay on top, keeping daysUntil order within the group', () => {
		const sorted = sortEvents(
			[
				ev({ name: 'soon', date: '2025-11-01' }),
				ev({ name: 'pinned-far', date: '2026-06-01', pinned: true }),
				ev({ name: 'pinned-soon', date: '2025-10-20', pinned: true }),
			],
			TODAY,
		);

		expect(sorted.map((e) => e.name)).toEqual(['pinned-soon', 'pinned-far', 'soon']);
	});

	it('a pinned expired event still outranks unpinned future ones', () => {
		const sorted = sortEvents(
			[
				ev({ name: 'future', date: '2025-12-01' }),
				ev({ name: 'pinned-past', date: '2025-01-01', pinned: true }),
			],
			TODAY,
		);

		expect(sorted.map((e) => e.name)).toEqual(['pinned-past', 'future']);
	});

	it('orders expired events most-recently-past first, after all future ones', () => {
		const sorted = sortEvents(
			[
				ev({ name: 'long-gone', date: '2020-05-01' }),
				ev({ name: 'recently-past', date: '2025-10-01' }),
				ev({ name: 'upcoming', date: '2025-11-01' }),
			],
			TODAY,
		);

		expect(sorted.map((e) => e.name)).toEqual([
			'upcoming',
			'recently-past',
			'long-gone',
		]);
	});

	it('sorts lunar yearly events by their converted solar occurrence', () => {
		// 八月十五 2025 → 2025-10-06 is already past on 2025-10-16, so the next
		// one is 2026; the solar 2025-12-25 event must come first.
		const sorted = sortEvents(
			[
				ev({
					name: 'moon',
					type: 'anniversary',
					date: '2024-08-15',
					calendar: 'lunar',
					repeat: 'yearly',
				}),
				ev({ name: 'xmas', date: '2025-12-25' }),
			],
			TODAY,
		);

		expect(sorted.map((e) => e.name)).toEqual(['xmas', 'moon']);
	});
});

describe('filterEvents', () => {
	const events = [
		ev({ name: 'a', type: 'countdown' }),
		ev({ name: 'b', type: 'birthday' }),
	];

	it("'all' returns everything", () => {
		expect(filterEvents(events, 'all')).toHaveLength(2);
	});

	it('type tabs keep only matching events', () => {
		const tabs: FilterTab[] = ['countdown', 'anniversary', 'birthday'];
		for (const tab of tabs) {
			const kept = filterEvents(events, tab);
			expect(kept.every((e) => e.type === tab)).toBe(true);
		}
		expect(filterEvents(events, 'birthday').map((e) => e.name)).toEqual(['b']);
		expect(filterEvents(events, 'anniversary')).toEqual([]);
	});
});

describe('countdownParts / countdownPrefix', () => {
	it('future → kind future + day count', () => {
		setLocale('en');
		const parts = countdownParts({ next: new Date(2025, 11, 25), daysUntil: 70 });
		expect(parts).toEqual({ kind: 'future', days: 70 });
		expect(countdownPrefix(parts.kind)).toBe('In');
	});

	it('today → kind today, no count', () => {
		setLocale('en');
		const parts = countdownParts({ next: TODAY, daysUntil: 0 });
		expect(parts).toEqual({ kind: 'today', days: null });
		expect(countdownPrefix(parts.kind)).toBe('Today');
	});

	it('past (next=null) → kind past + elapsed count', () => {
		setLocale('en');
		const parts = countdownParts({ next: null, daysUntil: -288 });
		expect(parts).toEqual({ kind: 'past', days: 288 });
		expect(countdownPrefix(parts.kind)).toBe('Ago');
	});

	it('zh locale → 还有 / 今天 / 已经', () => {
		setLocale('zh');
		expect(countdownPrefix('future')).toBe('还有');
		expect(countdownPrefix('today')).toBe('今天');
		expect(countdownPrefix('past')).toBe('已经');
	});
});

describe('cardOccurrence (anniversary count-up)', () => {
	it('anniversary with a past anchor counts up from the stored date', () => {
		// 领证 2022-08-22, yearly repeat — must NOT roll to 2027
		const occ = cardOccurrence(
			ev({ type: 'anniversary', date: '2022-08-22', repeat: 'yearly' }),
			TODAY,
		);
		expect(occ.next).toBeNull();
		expect(occ.daysUntil).toBeLessThan(0);
		// display: elapsed days + the original date
		const parts = countdownParts(occ);
		expect(parts.kind).toBe('past');
	});

	it('anniversary with a future anchor still counts down', () => {
		const occ = cardOccurrence(
			ev({ type: 'anniversary', date: '2030-01-01', repeat: 'yearly' }),
			TODAY,
		);
		expect(occ.daysUntil).toBeGreaterThan(0);
		expect(occ.next).not.toBeNull();
	});

	it('non-anniversary events are untouched', () => {
		const yearly = cardOccurrence(
			ev({ type: 'birthday', date: '2022-08-22', repeat: 'yearly' }),
			TODAY,
		);
		expect(yearly).toEqual(occurrenceOf(ev({ type: 'birthday', date: '2022-08-22', repeat: 'yearly' }), TODAY));
		expect(yearly.daysUntil).toBeGreaterThan(0); // rolled to the next birthday
	});
});

describe('createEventCardEl (row layout)', () => {
	it('renders name, date line with lunar label, and the day count', () => {
		setLocale('en');
		const el = createEventCardEl(
			ev({
				name: 'Christmas',
				date: '2025-12-25',
				repeat: 'yearly',
			}),
			{ today: TODAY },
		);

		expect(el.querySelector('.countdown-card__name')?.textContent).toBe('Christmas');
		// 2025-12-25 is 冬月初六
		expect(el.querySelector('.countdown-card__meta')?.textContent).toBe(
			'2025/12/25 (冬月初六)',
		);
		expect(el.querySelector('.countdown-card__prefix')?.textContent).toBe('In');
		expect(el.querySelector('.countdown-card__days')?.textContent).toBe('70');
		expect(el.querySelector('.countdown-card__unit')?.textContent).toBe('days');
	});

	it('zh date line uses full-width parens', () => {
		setLocale('zh');
		const el = createEventCardEl(
			ev({ name: '生日', date: '2026-12-18', repeat: 'none' }),
			{ today: TODAY },
		);

		// 2026-12-18 is 冬月初十
		expect(el.querySelector('.countdown-card__meta')?.textContent).toBe(
			'2026/12/18（冬月初十）',
		);
	});

	it('lunar events show the next occurrence converted to solar', () => {
		setLocale('en');
		const el = createEventCardEl(
			ev({
				name: '中秋',
				date: '2025-08-15',
				calendar: 'lunar',
				repeat: 'yearly',
			}),
			{ today: TODAY },
		);

		// 八月十五 2026 → 2026-09-25
		expect(el.querySelector('.countdown-card__meta')?.textContent).toContain('2026/09/25');
	});

	it('expired rows show the stored date and elapsed days', () => {
		setLocale('en');
		const el = createEventCardEl(
			ev({ name: 'gone', date: '2024-09-17' }),
			{ today: TODAY },
		);

		expect(el.querySelector('.countdown-card__meta')?.textContent).toContain('2024/09/17');
		expect(el.querySelector('.countdown-card__prefix')?.textContent).toBe('Ago');
		expect(el.className).toContain('countdown-card--expired');
	});

	it('today rows show no day number or unit', () => {
		setLocale('en');
		const el = createEventCardEl(
			ev({ name: 'now', date: '2025-10-16', repeat: 'yearly' }),
			{ today: TODAY },
		);

		expect(el.querySelector('.countdown-card__prefix')?.textContent).toBe('Today');
		expect(el.querySelector('.countdown-card__days')).toBeNull();
		expect(el.querySelector('.countdown-card__unit')).toBeNull();
	});

	it('adds the highlight class when daysUntil <= remind', () => {
		const highlighted = createEventCardEl(
			ev({ name: 'soon', date: '2025-10-18', remind: [3] }),
			{ today: TODAY },
		);
		const normal = createEventCardEl(ev({ name: 'later', date: '2026-05-01' }), {
			today: TODAY,
		});

		expect(highlighted.className).toContain('countdown-card--highlight');
		expect(normal.className).not.toContain('countdown-card--highlight');
	});

	it('hides the actions container when actions=false', () => {
		const withActions = createEventCardEl(ev({ name: 'a' }), { today: TODAY });
		const readOnly = createEventCardEl(ev({ name: 'a' }), {
			actions: false,
			today: TODAY,
		});

		expect(withActions.querySelector('.countdown-card__actions')).not.toBeNull();
		expect(readOnly.querySelector('.countdown-card__actions')).toBeNull();
	});

	it('renders note/edit/delete buttons only when handlers are given', () => {
		const clicked: string[] = [];
		const card = createEventCardEl(
			ev({ name: 'a', note: '[[gift list]]', remind: [1] }),
			{
				today: TODAY,
				onEdit: () => clicked.push('edit'),
				onDelete: () => clicked.push('delete'),
				onOpenNote: () => clicked.push('note'),
			},
		);

		const buttons = [
			...card.querySelectorAll('.countdown-card__action'),
		] as HTMLButtonElement[];
		expect(buttons).toHaveLength(3);

		// DOM order: note, edit, delete — click in reverse
		buttons[2].click();
		buttons[1].click();
		buttons[0].click();
		expect(clicked).toEqual(['delete', 'edit', 'note']);

		// visible text already names each button — aria-label would make
		// Obsidian render a hover tooltip on every row action
		for (const button of buttons) {
			expect(button.hasAttribute('aria-label')).toBe(false);
		}
	});

	it('anniversary with a past date counts up (已经 N 天, original date)', () => {
		setLocale('en');
		const card = createEventCardEl(
			ev({ type: 'anniversary', date: '2022-08-22', repeat: 'yearly' }),
			{ today: TODAY },
		);
		// live count-up: no weakened expired style
		expect(card.classList.contains('countdown-card--expired')).toBe(false);
		// original date in the meta line, not a rolled year
		const meta = card.querySelector('.countdown-card__meta') as HTMLElement;
		expect(meta.textContent).toContain('2022/08/22');
		// prefix + elapsed days instead of a future countdown
		const prefix = card.querySelector('.countdown-card__prefix') as HTMLElement;
		expect(prefix.textContent).toBe('Ago');
		const days = card.querySelector('.countdown-card__days') as HTMLElement;
		expect(Number(days.textContent)).toBeGreaterThan(0);
	});

	it('omits the note button when the event has no note', () => {
		const card = createEventCardEl(ev({ name: 'a' }), {
			today: TODAY,
			onOpenNote: () => {},
			onEdit: () => {},
			onDelete: () => {},
		});

		expect(card.querySelectorAll('.countdown-card__action')).toHaveLength(2);
	});

	it('renders a pin toggle as the first inline action', () => {
		const pinned: boolean[] = [];
		const card = createEventCardEl(ev({ name: 'a', pinned: true }), {
			today: TODAY,
			onPin: (e) => pinned.push(e.pinned === true),
			onEdit: () => {},
			onDelete: () => {},
		});

		const first = card.querySelector('.countdown-card__action') as HTMLButtonElement;
		expect(first.textContent).toBe('Unpin');
		first.click();
		expect(pinned).toEqual([true]);
	});

	it('shows a pinned badge next to the name for pinned events', () => {
		setLocale('zh');
		const pinned = createEventCardEl(ev({ name: 'a', pinned: true }), { today: TODAY });
		const plain = createEventCardEl(ev({ name: 'b' }), { today: TODAY });

		expect(pinned.querySelector('.countdown-card__pin-badge')?.textContent).toBe('置顶');
		expect(pinned.classList.contains('countdown-card--pinned')).toBe(true);
		expect(plain.querySelector('.countdown-card__pin-badge')).toBeNull();
	});
});

describe('createEventRowEl (swipe wrapper)', () => {
	it('wraps the card with reveal actions 置顶/编辑/删除', () => {
		setLocale('zh');
		const row = createEventRowEl(ev({ name: 'a' }), {
			today: TODAY,
			onPin: () => {},
			onEdit: () => {},
			onDelete: () => {},
		});

		expect(row.classList.contains('countdown-card-swipe')).toBe(true);
		expect(row.querySelector('.countdown-card')).not.toBeNull();
		const labels = [...row.querySelectorAll('.countdown-card-swipe__action')].map(
			(b) => b.textContent,
		);
		expect(labels).toEqual(['置顶', '编辑', '删除']);
	});

	it('swipe 置顶 button fires onPin', () => {
		const pinned: string[] = [];
		const row = createEventRowEl(ev({ name: 'a' }), {
			today: TODAY,
			onPin: (e) => pinned.push(e.name),
		});

		(row.querySelector('.countdown-card-swipe__action') as HTMLButtonElement).click();
		expect(pinned).toEqual(['a']);
	});
});

describe('occurrenceOf', () => {
	it('parses the stored date into the engine input', () => {
		const occ = occurrenceOf(ev({ date: '2025-12-25', repeat: 'yearly' }), TODAY);
		expect(occ.next).toEqual(new Date(2025, 11, 25));
		expect(occ.daysUntil).toBe(70);
	});
});
