import { Plugin } from 'obsidian';
import { resolveLocale, setLocale } from './settings-i18n/i18n';
import { CountdownSettingTab } from './settings-i18n/settings-tab';
import {
	DEFAULT_SETTINGS,
	mergeWithDefaults,
	type CountdownSettings,
} from './settings-i18n/settings';
import { EventStore } from './event-store/event-store';
import { registerCardView } from './card-view/register';
import { registerEmbedBlock } from './embed-block/register';
import { ReminderService } from './reminders/scheduler';
import { EMPTY_NOTIFIED_STATE, type NotifiedState } from './reminders/reminders';

/**
 * Persisted shape (data.json):
 * { settings?: unknown, notified?: unknown } — settings at the root is the
 * pre-reminders legacy shape and is still accepted on read.
 */
interface Persisted {
	settings?: unknown;
	notified?: { notified?: unknown };
}

function coerceNotifiedState(value: unknown): NotifiedState {
	const raw = (value as { notified?: unknown } | undefined)?.notified;
	if (!Array.isArray(raw)) return EMPTY_NOTIFIED_STATE;
	return {
		notified: raw.filter(
			(entry): entry is { filePath: string; occurrenceISO: string; daysUntil?: number } =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof (entry as { filePath?: unknown }).filePath === 'string' &&
				typeof (entry as { occurrenceISO?: unknown }).occurrenceISO === 'string' &&
				(typeof (entry as { daysUntil?: unknown }).daysUntil === 'number' ||
					(entry as { daysUntil?: unknown }).daysUntil === undefined),
		),
	};
}

/**
 * Plugin entry point. Assembles and registers the modules
 * (event-store, date-engine, settings-i18n, card-view, embed-block, reminders).
 */
export default class CountdownDayPlugin extends Plugin {
	settings: CountdownSettings = DEFAULT_SETTINGS;
	store!: EventStore;
	private notifiedState: NotifiedState = EMPTY_NOTIFIED_STATE;

	async onload(): Promise<void> {
		const persisted = (await this.loadData()) as Persisted | null;
		await this.loadSettings(persisted);
		this.notifiedState = coerceNotifiedState(persisted?.notified);

		setLocale(resolveLocale(window.moment.locale()));

		this.store = new EventStore(this.app, () => this.settings.eventFolder);
		await this.store.refresh();
		this.store.register(this);

		registerCardView(this);
		registerEmbedBlock(this);

		const reminders = new ReminderService(this);
		await reminders.start();

		this.addSettingTab(new CountdownSettingTab(this.app, this));
	}

	onunload(): void {
		// Obsidian resets the DOM; listeners are unregistered by the framework.
	}

	async loadSettings(persisted?: Persisted | null): Promise<void> {
		// legacy: settings fields at the root of data.json
		const source = persisted?.settings ?? persisted ?? null;
		this.settings = mergeWithDefaults(source);
	}

	async saveSettings(): Promise<void> {
		await this.saveData({ settings: this.settings, notified: this.notifiedState });
	}

	getNotifiedState(): NotifiedState {
		return this.notifiedState;
	}

	async setNotifiedState(state: NotifiedState): Promise<void> {
		this.notifiedState = state;
		await this.saveData({ settings: this.settings, notified: state });
	}
}
