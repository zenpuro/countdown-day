import type {
	CalendarType,
	EventType,
	RepeatRule,
} from '../date-engine/date-engine';
import {
	isValidLunarDate,
	solarToLunar,
} from '../date-engine/date-engine';
import type { EventInput } from '../event-store/frontmatter';
import { sanitizeFileName } from '../event-store/frontmatter';
import { t } from '../settings-i18n/i18n';

/** Supported lunar years (inside the date-engine table's 1895–2105 coverage). */
export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2100;

export interface EventFormState {
	name: string;
	type: EventType;
	calendar: CalendarType;
	y: number;
	m: number;
	d: number;
	leapMonth: boolean;
	repeat: RepeatRule;
	/** Interval in days for `repeat: 'custom'` (raw input, validated on save). */
	repeatEvery: string;
	note: string;
	/** Selected remind days (sorted unique); empty = off. */
	remind: number[];
}

export type FormError =
	| 'nameRequired'
	| 'dateInvalid'
	| 'remindInvalid'
	| 'repeatEveryInvalid'
	| 'yearRange';

export type FormResult =
	| { ok: true; input: EventInput; fileName: string }
	| { ok: false; error: FormError };

/** Form default: today's date in the chosen calendar. */
export function todayInCalendar(calendar: CalendarType, today: Date): { y: number; m: number; d: number } {
	if (calendar === 'solar') {
		return {
			y: today.getFullYear(),
			m: today.getMonth() + 1,
			d: today.getDate(),
		};
	}
	const lunar = solarToLunar(today);
	return { y: lunar.y, m: lunar.m, d: lunar.d };
}

/** Repeat preset by type: birthdays/anniversaries repeat yearly. */
export function defaultRepeatForType(type: EventType): RepeatRule {
	return type === 'countdown' ? 'none' : 'yearly';
}

/** Repeat options offered in the form (order = UI order). */
export const REPEAT_OPTIONS: readonly RepeatRule[] = [
	'none',
	'daily',
	'weekdays',
	'weekly',
	'monthly',
	'yearly',
	'custom',
];

/** i18n message key for a repeat option's label. */
export function repeatOptionKey(rule: RepeatRule): string {
	return `card-view.form.repeat.${rule}`;
}

/** Placeholder text key for the name input, per event type. */
export function namePlaceholderKey(type: EventType): string {
	return `card-view.form.namePlaceholder.${type}`;
}

/** Remind preset days offered in the sheet (order = UI order). */
export const REMIND_PRESETS: readonly number[] = [0, 1, 2, 3, 7];

/** Default value seeded into the custom remind wheel/input when opened. */
export const REMIND_CUSTOM_DEFAULT = 14;

/** Max day offset the custom remind picker allows. */
export const REMIND_CUSTOM_MAX = 30;

/** Localized label for a remind day value (0 = 当天). */
export function remindDayLabel(value: number): string {
	if (value === 0) return t('card-view.form.remind.day0');
	return t('card-view.form.remind.dayN', { n: value });
}

/**
 * Validate the form state and build the write payload + file name.
 * Mirrors the schema v1 rules the parser applies on read.
 */
export function buildEventInput(state: EventFormState): FormResult {
	if (state.name.trim() === '') return { ok: false, error: 'nameRequired' };

	if (state.calendar === 'lunar') {
		if (state.y < LUNAR_MIN_YEAR || state.y > LUNAR_MAX_YEAR) {
			return { ok: false, error: 'yearRange' };
		}
		if (!isValidLunarDate({ y: state.y, m: state.m, d: state.d, leapMonth: state.leapMonth })) {
			return { ok: false, error: 'dateInvalid' };
		}
	} else {
		const probe = new Date(state.y, state.m - 1, state.d);
		if (
			probe.getFullYear() !== state.y ||
			probe.getMonth() !== state.m - 1 ||
			probe.getDate() !== state.d
		) {
			return { ok: false, error: 'dateInvalid' };
		}
	}

	const remind = [...new Set(state.remind)].sort((a, b) => a - b);
	if (remind.some((n) => !Number.isInteger(n) || n < 0)) {
		return { ok: false, error: 'remindInvalid' };
	}

	let repeatEvery: number | undefined;
	if (state.repeat === 'custom') {
		const n = Number(state.repeatEvery.trim());
		if (!Number.isInteger(n) || n < 1) {
			return { ok: false, error: 'repeatEveryInvalid' };
		}
		repeatEvery = n;
	}

	const date = `${state.y}-${String(state.m).padStart(2, '0')}-${String(state.d).padStart(2, '0')}`;
	const input: EventInput = {
		type: state.type,
		date,
		calendar: state.calendar,
		repeat: state.repeat,
		...(repeatEvery !== undefined ? { repeatEvery } : {}),
		...(state.calendar === 'lunar' && state.leapMonth ? { leapMonth: true } : {}),
		...(state.note.trim() !== '' ? { note: state.note.trim() } : {}),
		...(remind.length > 0 ? { remind } : {}),
	};

	return { ok: true, input, fileName: sanitizeFileName(state.name) };
}

/** Localized error message for a form error. */
export function formErrorMessage(error: FormError): string {
	return t(`card-view.form.error.${error}` as never);
}
