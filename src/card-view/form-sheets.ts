import { setIcon, type App } from 'obsidian';
import { lunarToSolar } from '../date-engine/date-engine';
import type { CalendarType, RepeatRule } from '../date-engine/date-engine';
import { BottomSheetModal } from './bottom-sheet';
import { DatePickerComponent, type PickedDate } from './date-picker';
import {
	WheelColumn,
	lunarDayOptions,
	lunarMonthOptions,
	solarDayOptions,
	solarMonthOptions,
	wheelHeaderLabels,
	wheelIndexOf,
	wheelYearOptions,
	type WheelOption,
} from './wheel-picker';
import {
	REMIND_CUSTOM_DEFAULT,
	REMIND_CUSTOM_MAX,
	REMIND_PRESETS,
	REPEAT_OPTIONS,
	remindDayLabel,
	repeatOptionKey,
} from './form-logic';
import { t } from '../settings-i18n/i18n';

/**
 * Bottom-sheet selectors for the event form (date / remind / repeat).
 * Each sheet stacks on top of the form modal. Headers follow the shared
 * contract: [取消] [title] [确定] — no ✕ buttons. Remind is multi-select;
 * picking 自定义 opens a second stacked sheet (wheel picker on touch
 * devices, numeric input on desktop) to choose the day offset.
 */

/** A lucide check in the accent colour — the shared selected-row mark. */
function renderCheck(btn: HTMLElement): void {
	setIcon(btn.createSpan({ cls: 'countdown-sheet__check' }), 'check');
}

/** True on touch-first devices (phones/tablets) — wheel pickers there. */
export function isCoarsePointer(): boolean {
	return typeof window.matchMedia === 'function'
		? window.matchMedia('(pointer: coarse)').matches
		: false;
}

// ---- date sheet ----

interface DateSheetOptions {
	calendar: CalendarType;
	selected: { y: number; m: number; d: number; leapMonth: boolean };
	onSelect: (pick: PickedDate) => void;
}

export function openDateSheet(app: App, options: DateSheetOptions): void {
	if (isCoarsePointer()) {
		new WheelDateSheet(app, options).open();
	} else {
		new GridDateSheet(app, options).open();
	}
}

/** Desktop: calendar grid + year view; the pick previews until 确定. */
class GridDateSheet extends BottomSheetModal {
	private readonly options: DateSheetOptions;
	private host?: HTMLElement;
	private preview: PickedDate;

	constructor(app: App, options: DateSheetOptions) {
		super(app, { title: t('card-view.form.date') });
		this.options = options;
		this.preview = { ...options.selected };
	}

	protected renderSheet(body: HTMLElement): void {
		this.host = body.createDiv({ cls: 'countdown-sheet__picker-host' });
		this.renderGrid();
	}

	private renderGrid(): void {
		this.host?.empty();
		new DatePickerComponent({
			getCalendar: () => this.options.calendar,
			getSelectedSolar: () => this.previewSolar(),
			onSelect: (pick) => {
				this.preview = pick;
				this.renderGrid();
			},
		}).render(this.host!);
	}

	private previewSolar(): Date {
		const p = this.preview;
		return this.options.calendar === 'solar'
			? new Date(p.y, p.m - 1, p.d)
			: lunarToSolar({ y: p.y, m: p.m, d: p.d, leapMonth: p.leapMonth });
	}

	protected onSheetConfirm(): void {
		this.options.onSelect(this.preview);
		this.close();
	}
}

/** Touch devices: three snap-scroll wheels (年/月/日) + header 确定. */
class WheelDateSheet extends BottomSheetModal {
	private readonly options: DateSheetOptions;
	private year?: WheelColumn;
	private month?: WheelColumn;
	private day?: WheelColumn;

	constructor(app: App, options: DateSheetOptions) {
		super(app, { title: t('card-view.form.date') });
		this.options = options;
	}

	protected renderSheet(body: HTMLElement): void {
		const sel = this.options.selected;

		const headers = body.createDiv({ cls: 'countdown-wheel-head' });
		for (const label of wheelHeaderLabels()) {
			headers.createDiv({ cls: 'countdown-wheel-head__label', text: label });
		}

		const columns = body.createDiv({ cls: 'countdown-wheels' });

		this.year = new WheelColumn(
			wheelYearOptions(),
			wheelIndexOf(wheelYearOptions(), String(sel.y)),
			() => this.rebuildDependents(),
		);
		columns.append(this.year.el);

		this.month = new WheelColumn(
			this.monthOptions(),
			this.monthIndex(sel),
			() => this.rebuildDay(),
		);
		columns.append(this.month.el);

		this.day = new WheelColumn(this.dayOptions(), this.dayIndex(sel), () => {});
		columns.append(this.day.el);
	}

	protected onSheetConfirm(): void {
		const y = Number(this.year!.getSelected().value);
		const month = this.month!.getSelected();
		const day = Number(this.day!.getSelected().value);
		this.options.onSelect(
			this.options.calendar === 'lunar'
				? {
						y,
						m: Number(month.value.replace(/L$/, '')),
						d: day,
						leapMonth: month.value.endsWith('L'),
					}
				: { y, m: Number(month.value), d: day, leapMonth: false },
		);
		this.close();
	}

	/** Month column options for the wheel-selected year. */
	private monthOptions(): WheelOption[] {
		return this.options.calendar === 'lunar'
			? lunarMonthOptions(Number(this.year?.getSelected().value ?? this.options.selected.y))
			: solarMonthOptions();
	}

	private dayOptions(): WheelOption[] {
		const y = Number(this.year?.getSelected().value ?? this.options.selected.y);
		const month = this.month?.getSelected();
		if (!month) return [];
		if (this.options.calendar === 'lunar') {
			return lunarDayOptions(
				y,
				Number(month.value.replace(/L$/, '')),
				month.value.endsWith('L'),
			);
		}
		return solarDayOptions(y, Number(month.value));
	}

	private monthIndex(sel: { m: number; leapMonth: boolean }): number {
		const options = this.monthOptions();
		const value = this.options.calendar === 'lunar'
			? `${sel.m}${sel.leapMonth ? 'L' : ''}`
			: String(sel.m);
		return Math.min(wheelIndexOf(options, value), options.length - 1);
	}

	private dayIndex(sel: { d: number }): number {
		const options = this.dayOptions();
		return Math.min(wheelIndexOf(options, String(sel.d)), options.length - 1);
	}

	/** Year scrolled → month list may change (leap month) and days rebuild. */
	private rebuildDependents(): void {
		this.month?.setOptions(this.monthOptions(), 0);
		this.rebuildDay();
	}

	/** Month scrolled → day list rebuilds; day clamps into range. */
	private rebuildDay(): void {
		const previous = this.day?.getSelected().value ?? String(this.options.selected.d);
		this.day?.setOptions(this.dayOptions(), wheelIndexOf(this.dayOptions(), previous));
	}
}

// ---- custom numeric value sheet (remind day / repeat interval) ----

interface CustomValueSheetOptions {
	title: string;
	/** Inclusive range offered by the wheel/input. */
	min: number;
	max: number;
	/** Current value (clamped into range as the initial pick). */
	current: number;
	/** i18n key for the unit label, e.g. `card-view.form.remind.customUnit`. */
	unitKey: string;
	/** i18n key for the value prefix (may render as ''), e.g. 提前 / 每. */
	prefixKey?: string;
	onConfirmValue: (value: number) => void;
}

/**
 * Stacked sheet for one numeric choice: touch devices get a scroll wheel,
 * desktop a plain numeric input with the unit label. Header 取消/确定.
 */
class CustomValueSheet extends BottomSheetModal {
	private readonly options: CustomValueSheetOptions;
	private wheel?: WheelColumn;
	private input?: HTMLInputElement;

	constructor(app: App, options: CustomValueSheetOptions) {
		super(app, { title: options.title });
		this.options = options;
	}

	protected renderSheet(body: HTMLElement): void {
		if (isCoarsePointer()) {
			const values: WheelOption[] = [];
			for (let n = this.options.min; n <= this.options.max; n++) {
				values.push({ value: String(n), label: String(n) });
			}
			this.wheel = new WheelColumn(
				values,
				wheelIndexOf(values, String(this.clamp(this.options.current))),
				() => this.setConfirmEnabled(true),
			);
			const wrap = body.createDiv({ cls: 'countdown-wheels countdown-wheels--single' });
			wrap.append(this.wheel.el);
		} else {
			const row = body.createDiv({ cls: 'countdown-sheet__input-row' });
			const prefix = this.options.prefixKey
				? t(this.options.prefixKey as never)
				: '';
			if (prefix !== '') {
				row.createSpan({ text: prefix, cls: 'countdown-form__interval-label' });
			}
			this.input = row.createEl('input', {
				cls: 'countdown-form__interval-input',
				type: 'text',
				value: String(this.clamp(this.options.current)),
			});
			this.input.setAttribute('inputmode', 'numeric');
			this.input.addEventListener('input', () => this.syncInputState());
			row.createSpan({
				text: t(this.options.unitKey as never),
				cls: 'countdown-form__interval-label',
			});
			this.input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') this.onSheetConfirm();
			});
		}
	}

	protected onSheetOpened(): void {
		this.input?.focus();
		this.input?.select();
	}

	private clamp(n: number): number {
		return Math.min(Math.max(Math.round(n), this.options.min), this.options.max);
	}

	private syncInputState(): void {
		const raw = this.input?.value.trim() ?? '';
		const n = Number(raw);
		const valid = raw !== '' && Number.isInteger(n) && n >= this.options.min && n <= this.options.max;
		this.setConfirmEnabled(valid);
	}

	protected onSheetConfirm(): void {
		if (this.wheel) {
			this.options.onConfirmValue(Number(this.wheel.getSelected().value));
		} else {
			const n = Number(this.input?.value.trim() ?? '');
			if (!Number.isInteger(n) || n < this.options.min || n > this.options.max) return;
			this.options.onConfirmValue(n);
		}
		this.close();
	}
}

// ---- remind sheet (multi-select) ----

interface RemindSheetOptions {
	/** Currently selected days (sorted). */
	current: number[];
	onPick(days: number[]): void;
}

export function openRemindSheet(app: App, options: RemindSheetOptions): void {
	new RemindSheet(app, options).open();
}

class RemindSheet extends BottomSheetModal {
	private readonly options: RemindSheetOptions;
	private selected = new Set<number>();
	private body?: HTMLElement;

	constructor(app: App, options: RemindSheetOptions) {
		super(app, { title: t('card-view.form.remind') });
		this.options = options;
		this.selected = new Set(options.current);
	}

	protected renderSheet(body: HTMLElement): void {
		this.body = body;
		this.renderRows();
	}

	/** Preset rows + selected custom rows (toggleable) + 自定义… opener. */
	private renderRows(): void {
		this.body?.empty();

		for (const day of REMIND_PRESETS) {
			this.renderRow(remindDayLabel(day), this.selected.has(day), () => {
				this.toggle(day);
			});
		}

		for (const day of [...this.selected].sort((a, b) => a - b)) {
			if (REMIND_PRESETS.includes(day)) continue;
			this.renderRow(remindDayLabel(day), true, () => {
				this.toggle(day);
			});
		}

		this.renderRow(
			t('card-view.form.remind.customAdd'),
			false,
			() => this.openCustom(),
			'countdown-sheet__option--add',
		);
	}

	private renderRow(
		label: string,
		active: boolean,
		onClick: () => void,
		extraCls = '',
	): void {
		const btn = this.body!.createEl('button', {
			cls: `countdown-sheet__option${active ? ' is-active' : ''}${extraCls ? ` ${extraCls}` : ''}`,
		});
		btn.createSpan({ cls: 'countdown-sheet__option-label', text: label });
		if (active) renderCheck(btn);
		btn.addEventListener('click', onClick);
	}

	private toggle(day: number): void {
		if (this.selected.has(day)) this.selected.delete(day);
		else this.selected.add(day);
		this.renderRows();
	}

	/** 自定义… → stacked wheel/input sheet (1–30 天). */
	private openCustom(): void {
		const fallback =
			[...this.selected].filter((d) => !REMIND_PRESETS.includes(d)).pop()
			?? REMIND_CUSTOM_DEFAULT;
		new CustomValueSheet(this.app, {
			title: t('card-view.form.remind.customTitle'),
			min: 1,
			max: REMIND_CUSTOM_MAX,
			current: fallback,
			unitKey: 'card-view.form.remind.customUnit',
			prefixKey: 'card-view.form.remind.customPrefix',
			onConfirmValue: (value) => {
				this.selected.add(value);
				this.renderRows();
			},
		}).open();
	}

	protected onSheetConfirm(): void {
		this.options.onPick([...this.selected].sort((a, b) => a - b));
		this.close();
	}
}

// ---- repeat sheet (single-select; custom opens a stacked value sheet) ----

interface RepeatSheetOptions {
	current: RepeatRule;
	/** Current custom interval (repeat-every), parsed when current='custom'. */
	currentEvery: number;
	onPick(rule: RepeatRule, repeatEvery: number): void;
}

export function openRepeatSheet(app: App, options: RepeatSheetOptions): void {
	new RepeatSheet(app, options).open();
}

/** Upper bound offered by the custom repeat interval sheet. */
export const REPEAT_CUSTOM_MAX = 99;

class RepeatSheet extends BottomSheetModal {
	private readonly options: RepeatSheetOptions;
	private rule: RepeatRule;
	private repeatEvery: number;
	private body?: HTMLElement;

	constructor(app: App, options: RepeatSheetOptions) {
		super(app, { title: t('card-view.form.repeat') });
		this.options = options;
		this.rule = options.current;
		this.repeatEvery = options.currentEvery;
	}

	protected renderSheet(body: HTMLElement): void {
		this.body = body;
		this.renderRows();
	}

	private renderRows(): void {
		this.body?.empty();
		for (const rule of REPEAT_OPTIONS) {
			const label = rule === 'custom'
				? this.rule === 'custom'
					? t('card-view.form.repeatCustomValue', { n: this.repeatEvery })
					: t('card-view.form.repeat.custom')
				: t(repeatOptionKey(rule) as never);
			const btn = this.body!.createEl('button', {
				cls: `countdown-sheet__option${this.rule === rule ? ' is-active' : ''}`,
			});
			btn.createSpan({ cls: 'countdown-sheet__option-label', text: label });
			if (this.rule === rule) {
				renderCheck(btn);
			}
			btn.addEventListener('click', () => {
				if (rule === 'custom') {
					this.openCustom();
					return;
				}
				this.rule = rule;
				this.renderRows();
			});
		}
	}

	/** 自定义 → stacked wheel/input sheet for the interval. */
	private openCustom(): void {
		new CustomValueSheet(this.app, {
			title: t('card-view.form.repeat.customTitle'),
			min: 1,
			max: REPEAT_CUSTOM_MAX,
			current: this.repeatEvery,
			unitKey: 'card-view.form.repeatEvery.unit',
			prefixKey: 'card-view.form.repeatEvery.prefix',
			onConfirmValue: (value) => {
				this.repeatEvery = value;
				this.rule = 'custom';
				this.renderRows();
			},
		}).open();
	}

	protected onSheetConfirm(): void {
		this.options.onPick(this.rule, this.repeatEvery);
		this.close();
	}
}
