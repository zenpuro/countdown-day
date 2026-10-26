import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEventFile } from '../../src/event-store/parse';
import {
	applyEventToRecord,
	dedupeFileName,
	frontmatterFor,
	sanitizeFileName,
} from '../../src/event-store/frontmatter';

const warn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe('parseEventFile — valid files', () => {
	it('parses the spec example frontmatter completely', () => {
		const event = parseEventFile('Countdowns/妈妈生日.md', {
			type: 'birthday',
			date: '1985-06-08',
			calendar: 'lunar',
			repeat: 'yearly',
			note: '[[家人]]',
			remind: [3],
		});

		expect(event).toEqual({
			path: 'Countdowns/妈妈生日.md',
			name: '妈妈生日',
			type: 'birthday',
			date: '1985-06-08',
			calendar: 'lunar',
			leapMonth: false,
			repeat: 'yearly',
			note: '[[家人]]',
			remind: [3],
		});
	});

	it('minimal frontmatter (type + date) gets all defaults', () => {
		const spy = warn();
		const event = parseEventFile('Countdowns/trip.md', {
			type: 'countdown',
			date: '2030-01-01',
		});

		expect(event).toEqual({
			path: 'Countdowns/trip.md',
			name: 'trip',
			type: 'countdown',
			date: '2030-01-01',
			calendar: 'solar',
			leapMonth: false,
			repeat: 'none',
		});
		expect(spy).not.toHaveBeenCalled();
	});

	it('accepts a valid lunar leap-month date (2023 闰二月十五)', () => {
		const event = parseEventFile('Countdowns/e.md', {
			type: 'anniversary',
			date: '2023-02-15',
			calendar: 'lunar',
			'leap-month': true,
		});

		expect(event?.leapMonth).toBe(true);
		expect(event?.calendar).toBe('lunar');
	});

	it('parses pinned: true and omits it when absent', () => {
		const pinned = parseEventFile('Countdowns/p.md', {
			type: 'countdown',
			date: '2030-01-01',
			pinned: true,
		});
		const plain = parseEventFile('Countdowns/q.md', {
			type: 'countdown',
			date: '2030-01-01',
		});

		expect(pinned?.pinned).toBe(true);
		expect(plain?.pinned).toBeUndefined();
	});

	it('falls back to unpinned on a non-boolean pinned value (with warning)', () => {
		const spy = warn();
		const event = parseEventFile('Countdowns/r.md', {
			type: 'countdown',
			date: '2030-01-01',
			pinned: 'yes',
		});

		expect(event?.pinned).toBeUndefined();
		expect(spy).toHaveBeenCalledOnce();
	});

	it('ignores the removed legacy icon field (kept untouched in the file)', () => {
		const spy = warn();
		const event = parseEventFile('Countdowns/legacy.md', {
			type: 'birthday',
			date: '1990-05-05',
			icon: '🎂',
		});

		expect(event).not.toBeNull();
		expect(event).not.toHaveProperty('icon');
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('parseEventFile — excluded files (null + warn)', () => {
	it('missing type → null', () => {
		const spy = warn();
		expect(parseEventFile('Countdowns/a.md', { date: '2030-01-01' })).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('unknown type → null', () => {
		const spy = warn();
		expect(
			parseEventFile('Countdowns/a.md', { type: 'party', date: '2030-01-01' }),
		).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('the removed festival type → null (feature removed in v1.1)', () => {
		const spy = warn();
		expect(
			parseEventFile('Countdowns/a.md', { type: 'festival', date: '2030-01-01' }),
		).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('missing date → null', () => {
		const spy = warn();
		expect(parseEventFile('Countdowns/a.md', { type: 'countdown' })).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('impossible solar date (2025-02-30) → null', () => {
		const spy = warn();
		expect(
			parseEventFile('Countdowns/a.md', { type: 'countdown', date: '2025-02-30' }),
		).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('malformed date (1985/06/08) → null', () => {
		const spy = warn();
		expect(
			parseEventFile('Countdowns/a.md', { type: 'birthday', date: '1985/06/08' }),
		).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('lunar day-30 in a 29-day month (2025 腊月三十) → null', () => {
		const spy = warn();
		expect(
			parseEventFile('Countdowns/a.md', {
				type: 'anniversary',
				date: '2025-12-30',
				calendar: 'lunar',
			}),
		).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('non-object frontmatter → null + warn', () => {
		const spy = warn();
		expect(parseEventFile('Countdowns/a.md', 'garbage')).toBeNull();
		expect(spy).toHaveBeenCalled();
	});

	it('no frontmatter at all → null, silently (plain note, not an event)', () => {
		const spy = warn();
		expect(parseEventFile('Countdowns/a.md', null)).toBeNull();
		expect(parseEventFile('Countdowns/a.md', undefined)).toBeNull();
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('parseEventFile — tolerant field fallbacks (warn, keep the event)', () => {
	it('invalid calendar falls back to solar', () => {
		const spy = warn();
		const event = parseEventFile('Countdowns/a.md', {
			type: 'countdown',
			date: '2030-01-01',
			calendar: 'julian',
		});

		expect(event?.calendar).toBe('solar');
		expect(spy).toHaveBeenCalled();
	});

	it('leap-month on a year without that leap month falls back to false', () => {
		const spy = warn();
		const event = parseEventFile('Countdowns/a.md', {
			type: 'anniversary',
			date: '2024-02-15',
			calendar: 'lunar',
			'leap-month': true,
		});

		expect(event?.leapMonth).toBe(false);
		expect(spy).toHaveBeenCalled();
	});

	it('invalid repeat falls back to none', () => {
		const spy = warn();
		const event = parseEventFile('Countdowns/a.md', {
			type: 'countdown',
			date: '2030-01-01',
			repeat: 'hourly',
		});

		expect(event?.repeat).toBe('none');
		expect(spy).toHaveBeenCalled();
	});

	it('accepts every schema v1.2 repeat rule', () => {
		for (const rule of ['daily', 'weekdays', 'weekly', 'monthly', 'custom'] as const) {
			const event = parseEventFile('Countdowns/a.md', {
				type: 'countdown',
				date: '2030-01-01',
				repeat: rule,
			});
			expect(event?.repeat).toBe(rule);
		}
	});

	it('repeat=custom reads repeat-every; missing stays unset (engine defaults 1), invalid → 1 + warn', () => {
		const withInterval = parseEventFile('Countdowns/a.md', {
			type: 'countdown',
			date: '2030-01-01',
			repeat: 'custom',
			'repeat-every': 14,
		});
		const missing = parseEventFile('Countdowns/b.md', {
			type: 'countdown',
			date: '2030-01-01',
			repeat: 'custom',
		});
		const spy = warn();
		const invalid = parseEventFile('Countdowns/c.md', {
			type: 'countdown',
			date: '2030-01-01',
			repeat: 'custom',
			'repeat-every': 'soon',
		});

		expect(withInterval?.repeatEvery).toBe(14);
		expect(missing?.repeatEvery).toBeUndefined();
		expect(invalid?.repeatEvery).toBe(1);
		expect(spy).toHaveBeenCalled();
	});

	it('repeat-every is ignored for non-custom repeats', () => {
		const event = parseEventFile('Countdowns/a.md', {
			type: 'countdown',
			date: '2030-01-01',
			repeat: 'yearly',
			'repeat-every': 14,
		});

		expect(event?.repeatEvery).toBeUndefined();
	});

	it('invalid remind values are dropped', () => {
		const spy = warn();
		for (const bad of [-1, 2.5, 'soon']) {
			const event = parseEventFile('Countdowns/a.md', {
				type: 'countdown',
				date: '2030-01-01',
				remind: bad,
			});
			expect(event?.remind).toBeUndefined();
		}
		expect(spy).toHaveBeenCalled();
	});

	it('numeric-string remind is coerced; 0 is kept', () => {
		const coerced = parseEventFile('Countdowns/a.md', {
			type: 'countdown',
			date: '2030-01-01',
			remind: '3',
		});
		const zero = parseEventFile('Countdowns/b.md', {
			type: 'countdown',
			date: '2030-01-01',
			remind: 0,
		});

		expect(coerced?.remind).toEqual([3]);
		expect(zero?.remind).toEqual([0]);
	});

	it('non-string note is dropped', () => {
		const spy = warn();
		const event = parseEventFile('Countdowns/a.md', {
			type: 'countdown',
			date: '2030-01-01',
			note: 7,
		});

		expect(event?.note).toBeUndefined();
		expect(spy).toHaveBeenCalled();
	});
});

describe('frontmatterFor', () => {
	it('builds the spec-example shape (single remind day stays scalar)', () => {
		expect(
			frontmatterFor({
				type: 'birthday',
				date: '1985-06-08',
				calendar: 'lunar',
				repeat: 'yearly',
				note: '[[家人]]',
				remind: [3],
			}),
		).toEqual({
			type: 'birthday',
			date: '1985-06-08',
			calendar: 'lunar',
			repeat: 'yearly',
			note: '[[家人]]',
			remind: 3,
		});
	});

	it('writes multi remind as a sorted array; empty remind deletes the key', () => {
		expect(
			frontmatterFor({
				type: 'countdown',
				date: '2030-01-01',
				calendar: 'solar',
				repeat: 'none',
				remind: [7, 0, 3],
			}),
		).toMatchObject({ remind: [0, 3, 7] });

		const record: Record<string, unknown> = { remind: 3, type: 'countdown' };
		applyEventToRecord(record, {
			type: 'countdown',
			date: '2030-01-01',
			calendar: 'solar',
			repeat: 'none',
			remind: [],
		});
		expect('remind' in record).toBe(false);
	});

	it('omits leap-month when false and omits unset optionals', () => {
		expect(
			frontmatterFor({
				type: 'countdown',
				date: '2030-01-01',
				calendar: 'solar',
				repeat: 'none',
			}),
		).toEqual({
			type: 'countdown',
			date: '2030-01-01',
			calendar: 'solar',
			repeat: 'none',
		});
	});

	it('includes leap-month only for leap lunar dates', () => {
		const fm = frontmatterFor({
			type: 'anniversary',
			date: '2023-02-15',
			calendar: 'lunar',
			repeat: 'yearly',
			leapMonth: true,
		});

		expect(fm['leap-month']).toBe(true);
	});

	it('emits repeat-every for repeat=custom and clamps bad intervals', () => {
		expect(
			frontmatterFor({
				type: 'countdown',
				date: '2030-01-01',
				calendar: 'solar',
				repeat: 'custom',
				repeatEvery: 14,
			}),
		).toEqual({
			type: 'countdown',
			date: '2030-01-01',
			calendar: 'solar',
			repeat: 'custom',
			'repeat-every': 14,
		});

		expect(
			frontmatterFor({
				type: 'countdown',
				date: '2030-01-01',
				calendar: 'solar',
				repeat: 'custom',
			}),
		).toEqual({
			type: 'countdown',
			date: '2030-01-01',
			calendar: 'solar',
			repeat: 'custom',
			'repeat-every': 1,
		});
	});
});

describe('unknown fields survive read/write cycles', () => {
	it('applyEventToRecord deletes the note key when the form cleared it', () => {
		const record: Record<string, unknown> = {
			type: 'countdown',
			date: '2030-01-01',
			note: '[[开庭资料]]',
		};

		// form cleared the note → note omitted from EventInput → key removed
		applyEventToRecord(record, {
			type: 'countdown',
			date: '2030-06-15',
			calendar: 'solar',
			repeat: 'none',
		});
		expect('note' in record).toBe(false);

		// picking a note again writes it back
		applyEventToRecord(record, {
			type: 'countdown',
			date: '2030-06-15',
			calendar: 'solar',
			repeat: 'none',
			note: '[[家人]]',
		});
		expect(record.note).toBe('[[家人]]');
	});

	it('applyEventToRecord keeps user-written unknown keys (incl. legacy icon) over multiple rounds', () => {
		const record: Record<string, unknown> = {
			type: 'countdown',
			date: '2030-01-01',
			icon: '🎂',
			customField: 'keep me',
			tags: ['personal'],
		};

		const input = {
			type: 'countdown' as const,
			date: '2030-06-15',
			calendar: 'solar' as const,
			repeat: 'none' as const,
		};
		applyEventToRecord(record, input);
		applyEventToRecord(record, input);

		expect(record.customField).toBe('keep me');
		expect(record.tags).toEqual(['personal']);
		expect(record.icon).toBe('🎂'); // unknown key → never touched
		expect(record.date).toBe('2030-06-15');
	});

	it('applyEventToRecord drops a stale repeat-every when switching away from custom', () => {
		const record: Record<string, unknown> = {
			type: 'countdown',
			date: '2030-01-01',
			repeat: 'custom',
			'repeat-every': 14,
		};

		applyEventToRecord(record, {
			type: 'countdown',
			date: '2030-06-15',
			calendar: 'solar',
			repeat: 'weekly',
		});

		expect(record['repeat-every']).toBeUndefined();
		expect(record.repeat).toBe('weekly');
	});
});

describe('sanitizeFileName / dedupeFileName', () => {
	it('replaces filesystem-illegal characters', () => {
		expect(sanitizeFileName('旅行: 计划*2025?')).toBe('旅行 计划2025');
	});

	it('trims and falls back to a placeholder when empty', () => {
		expect(sanitizeFileName('   ')).toBe('untitled');
		expect(sanitizeFileName('  ok  ')).toBe('ok');
	});

	it('deduplicates against existing names', () => {
		expect(dedupeFileName('trip', new Set(['trip']))).toBe('trip 2');
		expect(dedupeFileName('trip', new Set(['trip', 'trip 2']))).toBe('trip 3');
		expect(dedupeFileName('new', new Set(['trip']))).toBe('new');
	});
});
