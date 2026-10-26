import { en, type MessageKey } from './locales/en';
import { zh } from './locales/zh';

/**
 * Minimal i18n: language follows Obsidian (`moment.locale()` starting with
 * "zh" → Simplified Chinese, otherwise English). UI code must never hardcode
 * copy — everything goes through `t()`.
 */

export type Locale = 'zh' | 'en';

const dictionaries: Record<Locale, Record<string, string>> = { en, zh };

let activeLocale: Locale = 'en';

/** Map a moment locale string to our two supported locales. */
export function resolveLocale(momentLocale: string): Locale {
	return momentLocale.startsWith('zh') ? 'zh' : 'en';
}

/** Set the active locale (called once at plugin load; tests use it directly). */
export function setLocale(locale: Locale): void {
	activeLocale = locale;
}

/** Translate `key`, interpolating `{param}` placeholders. Missing zh falls back to English with a warn. */
export function t(
	key: MessageKey,
	params?: Record<string, string | number>,
): string {
	let text = dictionaries[activeLocale][key];
	if (text === undefined) {
		console.warn(
			`[countdown-day] missing "${activeLocale}" translation for "${key}", falling back to English`,
		);
		text = dictionaries.en[key];
	}
	if (text === undefined) {
		console.warn(`[countdown-day] unknown i18n key "${key}"`);
		return key;
	}
	if (params) {
		for (const [name, value] of Object.entries(params)) {
			text = text.split(`{${name}}`).join(String(value));
		}
	}
	return text;
}
