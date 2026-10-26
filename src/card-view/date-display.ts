import { lunarToSolar, solarToLunar } from '../date-engine/date-engine';
import type { CountdownEvent } from '../event-store/event';
import type { OccurrenceResult } from '../date-engine/date-engine';
import { t } from '../settings-i18n/i18n';

/**
 * Event date-line display (per reference UI): `2026/12/18（冬月初十）` —
 * the counted date in solar form plus its Chinese lunar label in parens.
 * The counted date is the upcoming occurrence, or — for expired events —
 * the stored date converted to solar.
 */

// 农历月：正月..腊月（十一月称冬月）
const LUNAR_MONTHS_ZH = [
	'正月', '二月', '三月', '四月', '五月', '六月',
	'七月', '八月', '九月', '十月', '冬月', '腊月',
];

// 农历日：初一..初十 / 十一..十九 / 二十 / 廿一..廿九 / 三十
const LUNAR_DAYS_ZH = [
	'初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
	'十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
	'廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** Chinese lunar month label, e.g. `冬月`, `闰二月`. */
export function lunarMonthLabel(m: number, leapMonth: boolean): string {
	return `${leapMonth ? '闰' : ''}${LUNAR_MONTHS_ZH[m - 1]}`;
}

/** Chinese lunar day label, e.g. `初十`, `廿七`, `三十`. */
export function lunarDayLabel(d: number): string {
	return LUNAR_DAYS_ZH[d - 1];
}

/** Chinese lunar label for a lunar date, e.g. `冬月初十`, `闰二月十五`. */
export function lunarLabelChinese(y: number, m: number, d: number, leapMonth: boolean): string {
	return `${lunarMonthLabel(m, leapMonth)}${lunarDayLabel(d)}`;
}

/** Which date the row is counting down to (or marking, when expired). */
export function countedDateOf(event: CountdownEvent, occurrence: OccurrenceResult): Date {
	if (occurrence.next !== null) return occurrence.next;
	const [y, m, d] = event.date.split('-').map(Number);
	if (event.calendar !== 'lunar') return new Date(y, m - 1, d);
	return lunarToSolar({ y, m, d, leapMonth: event.leapMonth });
}

/** `2026/12/18（冬月初十）` — solar date + Chinese lunar label in parens. */
export function eventDateLine(event: CountdownEvent, occurrence: OccurrenceResult): string {
	const date = countedDateOf(event, occurrence);
	const solar = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
		date.getDate(),
	).padStart(2, '0')}`;
	const lunar = solarToLunar(date);
	return t('card-view.dateLine', {
		date: solar,
		lunar: lunarLabelChinese(lunar.y, lunar.m, lunar.d, lunar.leapMonth),
	});
}
