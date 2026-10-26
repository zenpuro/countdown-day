import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	resolveLocale,
	setLocale,
	t,
} from '../../src/settings-i18n/i18n';
import { en } from '../../src/settings-i18n/locales/en';
import { zh } from '../../src/settings-i18n/locales/zh';
import { mergeWithDefaults } from '../../src/settings-i18n/settings';

afterEach(() => {
	setLocale('en');
});

describe('locale dictionaries', () => {
	it('zh and en expose exactly the same key set', () => {
		expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
	});

	it('en is the source of truth with at least one message', () => {
		expect(Object.keys(en).length).toBeGreaterThan(0);
	});
});

describe('resolveLocale (language follows Obsidian)', () => {
	it("moment locale starting with 'zh' → zh", () => {
		expect(resolveLocale('zh')).toBe('zh');
		expect(resolveLocale('zh-cn')).toBe('zh');
		expect(resolveLocale('zh-TW')).toBe('zh');
	});

	it('any other locale → en', () => {
		expect(resolveLocale('en')).toBe('en');
		expect(resolveLocale('en-us')).toBe('en');
		expect(resolveLocale('fr')).toBe('en');
		expect(resolveLocale('de')).toBe('en');
	});
});

describe('t()', () => {
	it('returns English by default', () => {
		expect(t('settings.eventFolder.name')).toBe(en['settings.eventFolder.name']);
	});

	it('returns Chinese after setLocale("zh")', () => {
		setLocale('zh');
		expect(t('settings.eventFolder.name')).toBe(zh['settings.eventFolder.name']);
	});

	it('interpolates {param} placeholders', () => {
		expect(t('settings.test.greeting', { name: 'Obsidian', n: 3 })).toBe(
			'Hello Obsidian, 3 days left',
		);
	});

	it('falls back to English with a console.warn when zh lacks a key', () => {
		const key = 'settings.eventFolder.desc' as keyof typeof zh;
		const original = zh[key];
		delete zh[key];
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			setLocale('zh');
			expect(t(key)).toBe(en[key]);
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			zh[key] = original;
			warn.mockRestore();
		}
	});
});

describe('mergeWithDefaults', () => {
	it('returns defaults for empty/absent saved data', () => {
		expect(mergeWithDefaults(undefined)).toEqual({ eventFolder: 'Countdowns' });
		expect(mergeWithDefaults({})).toEqual({ eventFolder: 'Countdowns' });
	});

	it('keeps valid saved values', () => {
		expect(mergeWithDefaults({ eventFolder: 'Events/Sub' })).toEqual({
			eventFolder: 'Events/Sub',
		});
	});

	it('falls back to default for wrong-typed values', () => {
		expect(mergeWithDefaults({ eventFolder: 42 })).toEqual({
			eventFolder: 'Countdowns',
		});
	});
});
