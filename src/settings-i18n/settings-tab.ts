import {
	AbstractInputSuggest,
	App,
	PluginSettingTab,
	Setting,
	TFolder,
} from 'obsidian';
import { t } from './i18n';
import type CountdownDayPlugin from '../main';

/** Folder-path autocomplete for text inputs (official API pattern). */
class FolderSuggest extends AbstractInputSuggest<string> {
	getSuggestions(inputStr: string): string[] {
		const needle = inputStr.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(file): file is TFolder =>
					file instanceof TFolder &&
					file.path.toLowerCase().includes(needle),
			)
			.map((folder) => folder.path);
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}

	selectSuggestion(path: string): void {
		this.setValue(path);
		this.close();
	}
}

/**
 * Keep AbstractInputSuggest's keydown handling away from the IME: while a
 * Chinese/Japanese composition is active, Enter (keyCode 229) merely commits
 * candidates — Obsidian's suggest would read it as "pick the highlighted
 * folder" and replace the half-typed path (倒数纪念日 → 倒数). Capture-phase
 * stopPropagation runs before the suggest's own listener on the input.
 */
export function suppressImeKeydown(input: HTMLInputElement): void {
	input.addEventListener(
		'keydown',
		(evt: KeyboardEvent) => {
			// keyCode 229 is the only reliable composition signal on engines
			// that report isComposing=false for composition keydowns (e.g.
			// Safari); there is no standard replacement for it.
			const legacyKeyCode = (evt as unknown as { keyCode: number }).keyCode;
			if (evt.isComposing || legacyKeyCode === 229) {
				evt.stopPropagation();
			}
		},
		true,
	);
}

/** Settings UI — MVP: event folder path with suggestions. */
export class CountdownSettingTab extends PluginSettingTab {
	private readonly plugin: CountdownDayPlugin;

	constructor(app: App, plugin: CountdownDayPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings.eventFolder.name'))
			.setDesc(t('settings.eventFolder.desc'))
			.addText((text) =>
				text
					.setPlaceholder(this.plugin.settings.eventFolder)
					.setValue(this.plugin.settings.eventFolder)
					.onChange((value) => {
						this.plugin.settings.eventFolder = value.trim();
						void this.plugin.saveSettings();
					})
					.then((component) => {
						suppressImeKeydown(component.inputEl);
						new FolderSuggest(this.app, component.inputEl);
					}),
			);
	}
}
