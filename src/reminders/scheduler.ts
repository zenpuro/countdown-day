import { Notice, Platform } from 'obsidian';
import type CountdownDayPlugin from '../main';
import {
	dueNotifications,
	reminderMessage,
	EMPTY_NOTIFIED_STATE,
	type DueNotice,
	type NotifiedState,
} from './reminders';

const STARTUP_DELAY_MS = 5_000;
const INTERVAL_MS = 10 * 60_000;

/**
 * Reminder scheduling (MVP, SPEC-reminders.md):
 * - startup (onLayoutReady + short delay): catch up on missed windows
 * - every 10 minutes: midnight crossing / new files
 * - event-store change: immediate check
 * Desktop uses the Web Notification API (permission fallback to Notice);
 * mobile always uses Notice.
 */
export class ReminderService {
	private readonly plugin: CountdownDayPlugin;
	private state: NotifiedState = EMPTY_NOTIFIED_STATE;

	constructor(plugin: CountdownDayPlugin) {
		this.plugin = plugin;
	}

	async start(): Promise<void> {
		await this.loadState();

		this.plugin.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => void this.check(), STARTUP_DELAY_MS);
		});

		this.plugin.registerInterval(
			window.setInterval(() => void this.check(), INTERVAL_MS),
		);

		this.plugin.store.subscribe(() => void this.check());
	}

	async check(today: Date = new Date()): Promise<void> {
		const result = dueNotifications(
			this.plugin.store.getEvents(),
			today,
			this.state,
		);
		if (result.notices.length > 0) {
			for (const notice of result.notices) this.deliver(notice);
		}
		if (
			result.newState.notified.length !== this.state.notified.length ||
			result.notices.length > 0
		) {
			this.state = result.newState;
			await this.saveState();
		} else {
			this.state = result.newState;
		}
	}

	private deliver(notice: DueNotice): void {
		const message = reminderMessage({
			name: notice.event.name,
			daysUntil: notice.daysUntil,
			lunarDate:
				notice.event.calendar === 'lunar' ? notice.event.date : undefined,
		});
		const body = message;

		if (Platform.isDesktopApp && this.systemNotify(body)) return;
		new Notice(body);
	}

	/** Web Notification with permission request; false → caller falls back to Notice. */
	private systemNotify(body: string): boolean {
		try {
			const NotificationCtor = (
				window as unknown as { Notification?: typeof Notification }
			).Notification;
			if (!NotificationCtor) return false;

			if (NotificationCtor.permission === 'granted') {
				new NotificationCtor('Countdown Day', { body });
				return true;
			}
			if (NotificationCtor.permission === 'default') {
				void NotificationCtor.requestPermission().then((permission) => {
					if (permission === 'granted') new NotificationCtor('Countdown Day', { body });
					else new Notice(body);
				});
				return true; // handled either way
			}
			return false; // denied
		} catch {
			return false;
		}
	}

	private async loadState(): Promise<void> {
		this.state = this.plugin.getNotifiedState();
	}

	private async saveState(): Promise<void> {
		await this.plugin.setNotifiedState(this.state);
	}
}
