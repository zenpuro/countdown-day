import type { App, WorkspaceLeaf } from 'obsidian';
import { CountdownView, VIEW_TYPE_COUNTDOWN } from './countdown-view';
import { t } from '../settings-i18n/i18n';
import type CountdownDayPlugin from '../main';

/** Open the countdown view in a main-area tab, or focus the existing leaf (no duplicate tabs). */
export async function activateCountdownView(app: App): Promise<void> {
	const { workspace } = app;
	const existing = workspace.getLeavesOfType(VIEW_TYPE_COUNTDOWN);
	if (existing.length > 0) {
		await workspace.revealLeaf(existing[0]);
		return;
	}
	const leaf = workspace.getLeaf(true);
	if (!leaf) return;
	await leaf.setViewState({ type: VIEW_TYPE_COUNTDOWN, active: true });
	await workspace.revealLeaf(leaf);
}

/** Register the view + ribbon icon + open command (three entry points). */
export function registerCardView(plugin: CountdownDayPlugin): void {
	plugin.registerView(
		VIEW_TYPE_COUNTDOWN,
		(leaf: WorkspaceLeaf) => new CountdownView(leaf, plugin),
	);

	plugin.addRibbonIcon('calendar-clock', t('card-view.command.open'), () => {
		void activateCountdownView(plugin.app);
	});

	plugin.addCommand({
		id: 'open-countdown-view',
		name: t('card-view.command.open'),
		callback: () => void activateCountdownView(plugin.app),
	});
}
