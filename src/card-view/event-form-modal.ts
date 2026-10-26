import {
	App,
	Modal,
	FuzzySuggestModal,
	Setting,
	TFile,
} from 'obsidian';
import type { EventInput } from '../event-store/frontmatter';
import type { CountdownEvent } from '../event-store/event';
import { t } from '../settings-i18n/i18n';
import {
	buildEventInput,
	defaultRepeatForType,
	formErrorMessage,
	namePlaceholderKey,
	remindDayLabel,
	repeatOptionKey,
	todayInCalendar,
	type EventFormState,
} from './form-logic';
import {
	openDateSheet,
	openRemindSheet,
	openRepeatSheet,
} from './form-sheets';
import { styleAsBottomSheet, removeNativeCloseButton, mountModalInTab } from './bottom-sheet';
import { eventDateLine } from './date-display';
import { lunarToSolar, solarToLunar } from '../date-engine/date-engine';

/** Fuzzy file picker that stores the choice as a wikilink. */
class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private readonly onPick: (wikilink: string) => void;

	constructor(app: App, onPick: (wikilink: string) => void) {
		super(app);
		this.onPick = onPick;
		this.setPlaceholder(t('card-view.form.notePick'));
		// keep the native prompt look; only match its width to the sheets
		this.containerEl.addClass('countdown-note-suggest');
	}

	onOpen(): void {
		void super.onOpen();
		// no ✕ in the sheet family — Esc / click-outside still close it
		removeNativeCloseButton(this);
		mountModalInTab(this);
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		this.onPick(`[[${file.basename}]]`);
	}
}

/** `[[target|alias]]` → `alias` (falls back to the target path). */
function noteDisplayText(wikilink: string): string {
	const inner = wikilink.replace(/^\[\[|\]\]$/g, '');
	const parts = inner.split('|');
	return (parts[1] ?? parts[0]).trim();
}

/**
 * New/edit event modal styled after the reference sheet UI: custom header
 * (取消 / title / 保存), type row, then a large borderless name input whose
 * placeholder follows the type, then rows — calendar toggle + date
 * (calendar-grid picker), remind presets + custom, repeat options + custom
 * interval, linked note. The date picker converts picks into the active
 * calendar, so lunar dates are always valid by construction.
 */
export class EventFormModal extends Modal {
	private readonly onSubmit: (fileName: string, input: EventInput) => Promise<void>;
	private readonly editing?: CountdownEvent;
	private state: EventFormState;
	private errorEl?: HTMLElement;
	private saveBtn?: HTMLButtonElement;

	constructor(
		app: App,
		options: {
			onSubmit: (fileName: string, input: EventInput) => Promise<void>;
			editing?: CountdownEvent;
		},
	) {
		super(app);
		this.onSubmit = options.onSubmit;
		this.editing = options.editing;
		this.state = this.initialState();
	}

	private initialState(): EventFormState {
		if (this.editing) {
			const [y, m, d] = this.editing.date.split('-').map(Number);
			return {
				name: this.editing.name,
				type: this.editing.type,
				calendar: this.editing.calendar,
				y,
				m,
				d,
				leapMonth: this.editing.leapMonth,
				repeat: this.editing.repeat,
				repeatEvery: String(this.editing.repeatEvery ?? 1),
				note: this.editing.note ?? '',
				remind: [...(this.editing.remind ?? [])],
			};
		}
		const today = new Date();
		const solar = todayInCalendar('solar', today);
		return {
			name: '',
			type: 'countdown',
			calendar: 'solar',
			y: solar.y,
			m: solar.m,
			d: solar.d,
			leapMonth: false,
			repeat: 'none',
			repeatEvery: '3',
			note: '',
			remind: [],
		};
	}

	onOpen(): void {
		styleAsBottomSheet(this);
		mountModalInTab(this);
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('countdown-form');
		this.modalEl.addClass('countdown-form-modal');

		this.renderHeader(contentEl);

		// fields live in a padded body under the sticky header
		const body = contentEl.createDiv({ cls: 'countdown-form__body' });

		// type (segmented) — presets repeat and drives the name placeholder
		const typeSetting = new Setting(body).setName(t('card-view.form.type'));
		this.appendSegmented(
			typeSetting.controlEl,
			(['countdown', 'anniversary', 'birthday'] as const).map((type) => ({
				value: type,
				label: t(`card-view.filter.${type}` as never),
				active: this.state.type === type,
			})),
			(value) => {
				this.state.type = value as EventFormState['type'];
				this.state.repeat = defaultRepeatForType(this.state.type);
				this.refresh();
			},
		);

		// name — placeholder follows the type (倒计时名称 / 纪念日名称 / TA的名字)
		this.renderNameField(body);

		// calendar toggle + date value → bottom-sheet picker
		this.renderDateRow(body);

		// remind value → bottom-sheet multi-select sheet (custom via stacked sheet)
		this.renderRemindRow(body);

		// repeat value → bottom-sheet single-select sheet (custom via stacked sheet)
		this.renderRepeatRow(body);

		// linked note (fuzzy search)
		this.renderNoteRow(body);

		// error line
		this.errorEl = body.createDiv({ cls: 'countdown-form__error' });
	}

	/** Header on the shared sheet-header grid: [取消] [title] [保存]. */
	private renderHeader(contentEl: HTMLElement): void {
		const header = contentEl.createDiv({ cls: 'countdown-sheet__header countdown-form__header' });
		const cancel = header.createEl('button', {
			cls: 'countdown-sheet__cancel countdown-form__cancel',
			text: t('card-view.form.cancel'),
		});
		cancel.addEventListener('click', () => this.close());
		header.createDiv({
			cls: 'countdown-sheet__title countdown-form__title',
			text: t(this.editing ? 'card-view.form.title.edit' : 'card-view.form.title.new'),
		});

		this.saveBtn = header.createEl('button', {
			cls: 'countdown-sheet__confirm countdown-form__save',
			text: t('card-view.form.save'),
		});
		this.saveBtn.toggleAttribute('disabled', this.state.name.trim() === '');
		this.saveBtn.addEventListener('click', () => void this.submit());
	}

	private renderNameField(contentEl: HTMLElement): void {
		const wrap = contentEl.createDiv({ cls: 'countdown-form__name-wrap' });
		const input = wrap.createEl('input', {
			cls: 'countdown-form__name',
			type: 'text',
			value: this.state.name,
		});
		input.placeholder = t(namePlaceholderKey(this.state.type) as never);
		input.addEventListener('input', () => {
			this.state.name = input.value;
			this.saveBtn?.toggleAttribute('disabled', input.value.trim() === '');
		});
	}

	private appendSegmented(
		container: HTMLElement,
		entries: readonly { value: string; label: string; active: boolean }[],
		onPick: (value: string) => void,
	): void {
		const row = container.createDiv({ cls: 'countdown-form__segmented' });
		for (const entry of entries) {
			const btn = row.createEl('button', {
				text: entry.label,
				cls: `countdown-form__seg${entry.active ? ' is-active' : ''}`,
			});
			btn.addEventListener('click', () => onPick(entry.value));
		}
	}

	private renderDateRow(contentEl: HTMLElement): void {
		const setting = new Setting(contentEl).setName(t('card-view.form.date'));
		const row = setting.controlEl.createDiv({ cls: 'countdown-form__date-row' });

		// calendar toggle (公历/农历)
		const toggle = row.createDiv({ cls: 'countdown-form__calendar-toggle' });
		for (const cal of ['solar', 'lunar'] as const) {
			const btn = toggle.createEl('button', {
				text: t(cal === 'lunar' ? 'card-view.calendar.lunar' : 'card-view.calendar.solar'),
				cls: `countdown-form__seg${this.state.calendar === cal ? ' is-active' : ''}`,
			});
			btn.addEventListener('click', () => {
				if (this.state.calendar === cal) return;
				this.state = this.convertState(this.state, cal);
				this.refresh();
			});
		}

		// date value button → bottom-sheet picker (grid or wheel)
		this.appendValueButton(row, this.stateDateLine(), () =>
			openDateSheet(this.app, {
				calendar: this.state.calendar,
				selected: {
					y: this.state.y,
					m: this.state.m,
					d: this.state.d,
					leapMonth: this.state.leapMonth,
				},
				onSelect: (pick) => {
					this.state.y = pick.y;
					this.state.m = pick.m;
					this.state.d = pick.d;
					this.state.leapMonth = pick.leapMonth;
					this.refresh();
				},
			}),
		);
	}

	private renderRemindRow(contentEl: HTMLElement): void {
		const setting = new Setting(contentEl).setName(t('card-view.form.remind'));
		const days = [...this.state.remind].sort((a, b) => a - b);
		const label = days.length === 0
			? t('card-view.form.remind.none')
			: days
					.map((day) => remindDayLabel(day))
					.join(t('card-view.form.remind.separator'));

		this.appendValueButton(setting.controlEl, label, () =>
			openRemindSheet(this.app, {
				current: days,
				onPick: (picked) => {
					this.state.remind = picked;
					this.refresh();
				},
			}),
		);
	}

	/** `text ›` button opening a bottom-sheet selector. */
	private appendValueButton(
		container: HTMLElement,
		label: string,
		onOpen: () => void,
	): void {
		const btn = container.createEl('button', { cls: 'countdown-form__date-value' });
		btn.createSpan({ text: label, cls: 'countdown-form__date-text' });
		btn.createSpan({ text: '›', cls: 'countdown-form__chevron' });
		btn.addEventListener('click', () => onOpen());
	}

	private renderRepeatRow(contentEl: HTMLElement): void {
		const setting = new Setting(contentEl).setName(t('card-view.form.repeat'));
		const label = this.state.repeat === 'custom'
			? t('card-view.form.repeatCustomValue', { n: this.state.repeatEvery })
			: t(repeatOptionKey(this.state.repeat) as never);

		this.appendValueButton(setting.controlEl, label, () =>
			openRepeatSheet(this.app, {
				current: this.state.repeat,
				currentEvery: Number(this.state.repeatEvery) || 1,
				onPick: (rule, repeatEvery) => {
					this.state.repeat = rule;
					this.state.repeatEvery = String(repeatEvery);
					this.refresh();
				},
			}),
		);
	}

	private renderNoteRow(contentEl: HTMLElement): void {
		const setting = new Setting(contentEl).setName(t('card-view.form.note'));
		const row = setting.controlEl.createDiv({ cls: 'countdown-form__note-row' });
		const pick = row.createEl('button', {
			text:
				this.state.note === ''
					? t('card-view.form.notePick')
					: noteDisplayText(this.state.note),
				cls: 'countdown-form__mini-btn',
		});
		pick.addEventListener('click', () => {
			new NoteSuggestModal(this.app, (wikilink) => {
				this.state.note = wikilink;
				this.refresh();
			}).open();
		});
		if (this.state.note !== '') {
			const clear = row.createEl('button', {
				text: t('card-view.form.noteClear'),
				cls: 'countdown-form__mini-btn mod-warning',
			});
			clear.addEventListener('click', () => {
				this.state.note = '';
				this.refresh();
			});
		}
	}

	/** Displayed date value: the state's own date, e.g. `2026/12/18（冬月初十）`. */
	private stateDateLine(): string {
		const probe: CountdownEvent = {
			path: '',
			name: '',
			type: this.state.type,
			date: `${this.state.y}-${String(this.state.m).padStart(2, '0')}-${String(this.state.d).padStart(2, '0')}`,
			calendar: this.state.calendar,
			leapMonth: this.state.leapMonth,
			repeat: 'yearly',
		};
		// next: null → date-display falls back to the (converted) stored date
		return eventDateLine(probe, { next: null, daysUntil: 0 });
	}

	private convertState(state: EventFormState, target: 'solar' | 'lunar'): EventFormState {
		if (target === 'lunar') {
			const solar = new Date(state.y, state.m - 1, state.d);
			const lunar = solarToLunar(solar);
			return { ...state, calendar: 'lunar', y: lunar.y, m: lunar.m, d: lunar.d, leapMonth: lunar.leapMonth };
		}
		const solar = lunarToSolar({ y: state.y, m: state.m, d: state.d, leapMonth: state.leapMonth });
		return {
			...state,
			calendar: 'solar',
			y: solar.getFullYear(),
			m: solar.getMonth() + 1,
			d: solar.getDate(),
			leapMonth: false,
		};
	}

	private refresh(): void {
		this.render();
	}

	private async submit(): Promise<void> {
		if (this.state.name.trim() === '') {
			this.errorEl?.setText(formErrorMessage('nameRequired'));
			return;
		}
		const result = buildEventInput(this.state);
		if (!result.ok) {
			this.errorEl?.setText(formErrorMessage(result.error));
			return;
		}
		try {
			await this.onSubmit(result.fileName, result.input);
			this.close();
		} catch (error) {
			console.error('[countdown-day] failed to save event', error);
			this.errorEl?.setText(String(error));
		}
	}
}


