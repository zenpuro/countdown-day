import { solarToLunar } from '../date-engine/date-engine';
import type { CalendarType } from '../date-engine/date-engine';
import { lunarDayLabel, lunarMonthLabel } from './date-display';
import { t } from '../settings-i18n/i18n';

/**
 * Calendar-grid date picker (per reference UI): navigates by solar month,
 * shows a Chinese lunar sublabel under each day (month name on day 1,
 * e.g. 「冬月」, day name otherwise, e.g. 「初十」). Works for both calendars:
 * picking a day converts to the active calendar (solar → as-is, lunar →
 * solarToLunar), so an invalid lunar date can never be produced.
 * Grid math is pure (exported) for unit tests; the class only wires the DOM.
 */

export const PICKER_MIN_YEAR = 1900;
export const PICKER_MAX_YEAR = 2100;

/** Fixed 42-cell (6 weeks, Sunday-first) grid for a solar month; null = filler. */
export function monthGrid(y: number, m: number): (number | null)[] {
	const firstWeekday = new Date(y, m - 1, 1).getDay();
	const daysInMonth = new Date(y, m, 0).getDate();
	const cells: (number | null)[] = [];
	for (let i = 0; i < firstWeekday; i++) cells.push(null);
	for (let d = 1; d <= daysInMonth; d++) cells.push(d);
	while (cells.length < 42) cells.push(null);
	return cells;
}

export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
	const zero = y * 12 + (m - 1) + delta;
	return { y: Math.floor(zero / 12), m: (zero % 12) + 1 };
}

export function clampMonth(y: number, m: number): { y: number; m: number } {
	if (y < PICKER_MIN_YEAR) return { y: PICKER_MIN_YEAR, m: 1 };
	if (y > PICKER_MAX_YEAR) return { y: PICKER_MAX_YEAR, m: 12 };
	return { y, m };
}

/** First year of a year's decade, e.g. 2026 → 2020. */
export function decadeOf(y: number): number {
	return y - (y % 10);
}

/** The ten years of a decade, clamped to the supported range. */
export function yearsInDecade(from: number): number[] {
	const start = Math.max(from, PICKER_MIN_YEAR);
	const years: number[] = [];
	for (let y = start; y < start + 10 && y <= PICKER_MAX_YEAR; y++) {
		years.push(y);
	}
	return years;
}

export interface PickedDate {
	y: number;
	m: number;
	d: number;
	leapMonth: boolean;
}

/** Convert a solar-grid pick into the active calendar's components. */
export function convertPick(
	y: number,
	m: number,
	d: number,
	calendar: CalendarType,
): PickedDate {
	if (calendar === 'solar') return { y, m, d, leapMonth: false };
	const lunar = solarToLunar(new Date(y, m - 1, d));
	return { y: lunar.y, m: lunar.m, d: lunar.d, leapMonth: lunar.leapMonth };
}

export interface DatePickerCallbacks {
	/** Active form calendar — picks are converted into it. */
	getCalendar(): CalendarType;
	/** Currently selected date as a solar Date (grid highlight). */
	getSelectedSolar(): Date;
	/** Called when the user picks a day (converted to the active calendar). */
	onSelect(pick: PickedDate): void;
}

/** DOM component: header nav + weekday row + 6-week grid + today button.
 * The month title opens a stacked year view (decade grid) so far-away years
 * don't need month-by-month paging. */
export class DatePickerComponent {
	private readonly cb: DatePickerCallbacks;
	private viewY: number;
	private viewM: number;
	private mode: 'days' | 'years' = 'days';
	private decadeStart: number;
	private root?: HTMLElement;

	constructor(cb: DatePickerCallbacks) {
		this.cb = cb;
		const init = clampMonth(
			cb.getSelectedSolar().getFullYear(),
			cb.getSelectedSolar().getMonth() + 1,
		);
		this.viewY = init.y;
		this.viewM = init.m;
		this.decadeStart = decadeOf(init.y);
	}

	render(container: HTMLElement): void {
		this.root = container;
		const picker = container.createDiv({ cls: 'countdown-datepicker' });
		if (this.mode === 'years') {
			this.renderYearView(picker);
			return;
		}

		// header: ‹ 2026年12月 › (title opens the year view)
		const header = picker.createDiv({ cls: 'countdown-datepicker__header' });
		const prev = header.createEl('button', {
			cls: 'countdown-datepicker__nav',
			text: '‹',
		});
		prev.addEventListener('click', () => this.navigate(-1));
		const title = header.createEl('button', {
			cls: 'countdown-datepicker__month',
			text: t('card-view.datePicker.month', { y: this.viewY, m: this.viewM }),
		});
		title.addEventListener('click', () => {
			this.mode = 'years';
			this.rerender();
		});
		const next = header.createEl('button', {
			cls: 'countdown-datepicker__nav',
			text: '›',
		});
		next.addEventListener('click', () => this.navigate(1));

		// weekday row
		const weekdays = picker.createDiv({ cls: 'countdown-datepicker__weekdays' });
		for (const label of t('card-view.datePicker.weekdays').split(',')) {
			weekdays.createSpan({ cls: 'countdown-datepicker__weekday', text: label });
		}

		// day grid
		const grid = picker.createDiv({ cls: 'countdown-datepicker__grid' });
		const selected = this.cb.getSelectedSolar();
		const today = new Date();
		for (const day of monthGrid(this.viewY, this.viewM)) {
			if (day === null) {
				grid.createSpan({ cls: 'countdown-datepicker__cell is-empty' });
				continue;
			}
			const cell = grid.createEl('button', { cls: 'countdown-datepicker__cell' });
			cell.createSpan({ cls: 'countdown-datepicker__day', text: String(day) });
			cell.createSpan({ cls: 'countdown-datepicker__lunar', text: this.lunarSublabel(day) });

			const cellDate = new Date(this.viewY, this.viewM - 1, day);
			if (this.sameDay(cellDate, today)) cell.classList.add('is-today');
			if (this.sameDay(cellDate, selected)) cell.classList.add('is-selected');
			cell.addEventListener('click', () =>
				this.cb.onSelect(convertPick(this.viewY, this.viewM, day, this.cb.getCalendar())),
			);
		}

		// footer: jump to today
		const footer = picker.createDiv({ cls: 'countdown-datepicker__footer' });
		const todayBtn = footer.createEl('button', {
			cls: 'countdown-datepicker__today',
			text: t('card-view.datePicker.today'),
		});
		todayBtn.addEventListener('click', () => {
			const now = new Date();
			const view = clampMonth(now.getFullYear(), now.getMonth() + 1);
			this.viewY = view.y;
			this.viewM = view.m;
			this.cb.onSelect(convertPick(now.getFullYear(), now.getMonth() + 1, now.getDate(), this.cb.getCalendar()));
		});
	}

	/** Decade grid for direct year selection. */
	private renderYearView(picker: HTMLElement): void {
		const header = picker.createDiv({ cls: 'countdown-datepicker__header' });
		const prev = header.createEl('button', {
			cls: 'countdown-datepicker__nav',
			text: '‹',
		});
		prev.addEventListener('click', () => {
			this.decadeStart = Math.max(decadeOf(this.decadeStart - 10), decadeOf(PICKER_MIN_YEAR));
			this.rerender();
		});
		header.createSpan({
			cls: 'countdown-datepicker__month',
			text: t('card-view.datePicker.decade', {
				from: this.decadeStart,
				to: this.decadeStart + 9,
			}),
		});
		const next = header.createEl('button', {
			cls: 'countdown-datepicker__nav',
			text: '›',
		});
		next.addEventListener('click', () => {
			this.decadeStart = Math.min(decadeOf(this.decadeStart + 10), decadeOf(PICKER_MAX_YEAR));
			this.rerender();
		});

		const grid = picker.createDiv({ cls: 'countdown-datepicker__years' });
		const today = new Date();
		const selectedYear = this.cb.getSelectedSolar().getFullYear();
		for (const y of yearsInDecade(this.decadeStart)) {
			const cell = grid.createEl('button', {
				cls: 'countdown-datepicker__year',
				text: String(y),
			});
			if (y === today.getFullYear()) cell.classList.add('is-today');
			if (y === selectedYear) cell.classList.add('is-selected');
			cell.addEventListener('click', () => {
				this.viewY = y;
				this.mode = 'days';
				this.rerender();
			});
		}
	}

	/** `冬月` on lunar day 1 (navigational anchor), `初十` otherwise. */
	private lunarSublabel(solarDay: number): string {
		const lunar = solarToLunar(new Date(this.viewY, this.viewM - 1, solarDay));
		return lunar.d === 1
			? lunarMonthLabel(lunar.m, lunar.leapMonth)
			: lunarDayLabel(lunar.d);
	}

	private navigate(delta: number): void {
		const next = clampMonth(
			shiftMonth(this.viewY, this.viewM, delta).y,
			shiftMonth(this.viewY, this.viewM, delta).m,
		);
		this.viewY = next.y;
		this.viewM = next.m;
		this.rerender();
	}

	/** Re-render in place (keeps the picker anchored in the form). */
	private rerender(): void {
		if (!this.root) return;
		this.root.empty();
		this.render(this.root);
	}

	private sameDay(a: Date, b: Date): boolean {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}
}
