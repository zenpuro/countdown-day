import { lunarLeapMonth, lunarMonthDays } from '../date-engine/date-engine';
import { lunarDayLabel, lunarMonthLabel } from './date-display';
import { PICKER_MAX_YEAR, PICKER_MIN_YEAR } from './date-picker';
import { t } from '../settings-i18n/i18n';

/**
 * Mobile date wheel picker (iOS-style): three scroll-snap columns for
 * year/month/day with a centered highlight band and a confirm button.
 * Option-list construction is pure (exported) for unit tests; the column
 * component only wires scrolling to selection.
 */

/** Height of one wheel row (px) — CSS and JS must agree. */
export const WHEEL_ITEM_HEIGHT = 40;

export interface WheelOption {
	/** Stable value used for selection/confirm. */
	value: string;
	/** Displayed label. */
	label: string;
}

/** `1900 … 2100` — one option per year in the supported range. */
export function wheelYearOptions(): WheelOption[] {
	const options: WheelOption[] = [];
	for (let y = PICKER_MIN_YEAR; y <= PICKER_MAX_YEAR; y++) {
		options.push({ value: String(y), label: String(y) });
	}
	return options;
}

/** Solar months `1 … 12`. */
export function solarMonthOptions(): WheelOption[] {
	return Array.from({ length: 12 }, (_, i) => ({
		value: String(i + 1),
		label: String(i + 1),
	}));
}

/** Solar days `1 … daysInMonth`. */
export function solarDayOptions(y: number, m: number): WheelOption[] {
	const days = new Date(y, m, 0).getDate();
	return Array.from({ length: days }, (_, i) => ({
		value: String(i + 1),
		label: String(i + 1),
	}));
}

/** Leap months get a `L`-suffixed value, e.g. `2L` = 闰二月 (2023). */
export function lunarMonthOptions(y: number): WheelOption[] {
	const leap = lunarLeapMonth(y);
	const options: WheelOption[] = [];
	for (let m = 1; m <= 12; m++) {
		options.push({ value: String(m), label: lunarMonthLabel(m, false) });
		if (leap === m) {
			options.push({ value: `${m}L`, label: lunarMonthLabel(m, true) });
		}
	}
	return options;
}

/** Lunar days `初一 … 初二十九/三十` of the given lunar month. */
export function lunarDayOptions(y: number, m: number, leap: boolean): WheelOption[] {
	const days = lunarMonthDays(y, m, leap);
	return Array.from({ length: days }, (_, i) => ({
		value: String(i + 1),
		label: lunarDayLabel(i + 1),
	}));
}

/** Find the index of a value in a column; 0 when missing (caller clamps). */
export function wheelIndexOf(options: readonly WheelOption[], value: string): number {
	const idx = options.findIndex((option) => option.value === value);
	return idx === -1 ? 0 : idx;
}

/**
 * One snap-scrolling column. Scroll position is the source of truth while
 * the user is scrolling; the settled position is reported via onChange.
 */
export class WheelColumn {
	readonly el: HTMLElement;
	private readonly scrollEl: HTMLElement;
	private readonly onChange: (index: number) => void;
	private options: readonly WheelOption[] = [];
	private index = 0;
	private settleTimer?: number;

	constructor(options: readonly WheelOption[], selectedIndex: number, onChange: (index: number) => void) {
		this.onChange = onChange;
		this.el = createDiv();
		this.el.className = 'countdown-wheel';

		this.scrollEl = this.el.createDiv({ cls: 'countdown-wheel__scroll' });
		this.scrollEl.addEventListener('scroll', () => this.scheduleSettle());
		// block the click-outside/tap-through while flicking
		this.scrollEl.addEventListener('click', (e) => e.stopPropagation());

		this.el.createDiv({ cls: 'countdown-wheel__highlight' });
		this.setOptions(options, selectedIndex);
	}

	getSelected(): WheelOption {
		return this.options[this.index];
	}

	/** Replace options (e.g. day count changed) and scroll to a selection. */
	setOptions(options: readonly WheelOption[], selectedIndex: number): void {
		this.options = options;
		this.index = Math.min(Math.max(selectedIndex, 0), options.length - 1);
		this.renderItems();
		// sync first (works whenever layout exists), then re-assert after two
		// frames — some mobile webviews reset scroll while the sheet animates in
		this.scrollEl.scrollTop = this.index * WHEEL_ITEM_HEIGHT;
		window.requestAnimationFrame(() =>
			window.requestAnimationFrame(() => this.scrollToIndex(this.index, false)),
		);
	}

	private renderItems(): void {
		this.scrollEl.empty();
		this.options.forEach((option, i) => {
			const item = this.scrollEl.createDiv({
				cls: `countdown-wheel__item${i === this.index ? ' is-selected' : ''}`,
				text: option.label,
			});
			item.style.height = `${WHEEL_ITEM_HEIGHT}px`;
			item.addEventListener('click', () => this.scrollToIndex(i, true));
		});
	}

	/** Programmatic scroll; smooth only when the user tapped an item. */
	private scrollToIndex(index: number, smooth: boolean): void {
		this.index = index;
		this.scrollEl.scrollTo({
			top: index * WHEEL_ITEM_HEIGHT,
			behavior: smooth ? 'smooth' : 'instant',
		});
		this.paintSelection();
	}

	private scheduleSettle(): void {
		window.clearTimeout(this.settleTimer);
		this.settleTimer = window.setTimeout(() => {
			const raw = this.scrollEl.scrollTop / WHEEL_ITEM_HEIGHT;
			const index = Math.min(Math.max(Math.round(raw), 0), this.options.length - 1);
			if (index !== this.index) {
				this.index = index;
				this.paintSelection();
				this.onChange(index);
			}
		}, 120);
	}

	private paintSelection(): void {
		this.scrollEl.childNodes.forEach((node, i) => {
			(node as HTMLElement).classList?.toggle('is-selected', i === this.index);
		});
	}
}

/** Wheel column header labels (年 / 月 / 日). */
export function wheelHeaderLabels(): [string, string, string] {
	return [
		t('card-view.wheel.year'),
		t('card-view.wheel.month'),
		t('card-view.wheel.day'),
	];
}
