import { describe, expect, it } from 'vitest';
import {
	parseEmbedOptions,
	renderEmbed,
} from '../../src/embed-block/embed-block';
import { setLocale } from '../../src/settings-i18n/i18n';
import type { CountdownEvent } from '../../src/event-store/event';

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

describe('parseEmbedOptions', () => {
	it('empty body → all defaults, no warnings', () => {
		expect(parseEmbedOptions('')).toEqual({
			types: null,
			limit: null,
			warnings: [],
		});
		expect(parseEmbedOptions('   \n  \n')).toEqual({
			types: null,
			limit: null,
			warnings: [],
		});
	});

	it('parses a type list and a limit together', () => {
		expect(parseEmbedOptions('type: birthday, anniversary\nlimit: 5')).toEqual({
			types: ['birthday', 'anniversary'],
			limit: 5,
			warnings: [],
		});
	});

	it('the removed festival type invalidates the whole type line', () => {
		const result = parseEmbedOptions('type: birthday, festival');
		expect(result.types).toBeNull();
		expect(result.warnings).toHaveLength(1);
	});

	it('tolerates extra whitespace in keys and values', () => {
		expect(parseEmbedOptions('  type  :   birthday , anniversary  ')).toEqual({
			types: ['birthday', 'anniversary'],
			limit: null,
			warnings: [],
		});
	});

	it('ignores the whole type line when any token is unknown', () => {
		const result = parseEmbedOptions('type: birthday, party');
		expect(result.types).toBeNull();
		expect(result.warnings).toHaveLength(1);
	});

	it('ignores invalid limit values (0, negative, fractional, non-numeric)', () => {
		for (const bad of ['limit: 0', 'limit: -3', 'limit: 2.5', 'limit: five']) {
			const result = parseEmbedOptions(bad);
			expect(result.limit, bad).toBeNull();
			expect(result.warnings, bad).toHaveLength(1);
		}
	});

	it('warns on unknown option keys', () => {
		const result = parseEmbedOptions('foo: bar\ntype: birthday');
		expect(result.types).toEqual(['birthday']);
		expect(result.warnings).toEqual(['foo: bar']);
	});

	it('last duplicate key wins without warning', () => {
		const result = parseEmbedOptions('limit: 2\nlimit: 7');
		expect(result.limit).toBe(7);
		expect(result.warnings).toEqual([]);
	});
});

describe('renderEmbed (read-only cards)', () => {
	const events = [
		ev({ name: 'a', type: 'countdown', date: '2025-12-25', repeat: 'yearly' }),
		ev({ name: 'b', type: 'birthday', date: '2026-01-20', repeat: 'yearly' }),
		ev({ name: 'c', type: 'anniversary', date: '2026-02-17', repeat: 'yearly' }),
	];

	it('renders all events as read-only cards (no action buttons)', () => {
		setLocale('en');
		const el = document.createElement('div');
		renderEmbed(el, { source: '', events });

		expect(el.querySelectorAll('.countdown-card')).toHaveLength(3);
		expect(el.querySelector('.countdown-card__actions')).toBeNull();
		expect(el.querySelector('.countdown-embed__warning')).toBeNull();
	});

	it('applies type filter and limit from the source', () => {
		setLocale('en');
		const el = document.createElement('div');
		renderEmbed(el, {
			source: 'type: countdown, anniversary\nlimit: 1',
			events,
		});

		const cards = el.querySelectorAll('.countdown-card');
		expect(cards).toHaveLength(1);
		expect(cards[0].textContent).toContain('a'); // countdown sorts before anniversary
	});

	it('shows a single warning line for invalid options', () => {
		setLocale('en');
		const el = document.createElement('div');
		renderEmbed(el, { source: 'foo: bar', events });

		const warning = el.querySelector('.countdown-embed__warning');
		expect(warning?.textContent).toContain('foo: bar');
	});

	it('shows the i18n empty state when nothing matches', () => {
		setLocale('en');
		const el = document.createElement('div');
		renderEmbed(el, { source: 'type: birthday\nlimit: 5', events: [events[0]] });

		const empty = el.querySelector('.countdown-embed__empty');
		expect(empty?.textContent).toBe('No matching events.');
	});

	it('card click opens the event file', () => {
		setLocale('en');
		let opened: string | null = null;
		const el = document.createElement('div');
		renderEmbed(el, {
			source: '',
			events: [events[0]],
			onOpenEvent: (event) => {
				opened = event.path;
			},
		});

		(el.querySelector('.countdown-card') as HTMLElement).click();
		expect(opened).toBe('Countdowns/a.md');
	});
});
