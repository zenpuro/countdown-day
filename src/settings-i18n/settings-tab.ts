import {
	AbstractInputSuggest,
	App,
	PluginSettingTab,
	Setting,
	TFolder,
} from 'obsidian';
import { t } from './i18n';
import type CountdownDayPlugin from '../main';

/**
 * Folder-path autocomplete for text inputs (official API pattern).
 *
 * `onPicked` is mandatory: AbstractInputSuggest.setValue only writes the text
 * into the input — it never fires TextComponent.onChange, so a picked
 * suggestion used to look applied while settings kept the last-typed prefix
 * (lost on the next re-render / restart).
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
	private readonly onPicked: (path: string) => void;

	constructor(app: App, input: HTMLInputElement, onPicked: (path: string) => void) {
		super(app, input);
		this.onPicked = onPicked;
	}

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
		this.onPicked(path);
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
					.onChange((value) => this.applyFolder(value))
					.then((component) => {
						suppressImeKeydown(component.inputEl);
						new FolderSuggest(this.app, component.inputEl, (path) =>
							this.applyFolder(path),
						);
					}),
			);
	}

	/**
	 * Single write path for the folder setting (typed input AND picked
	 * suggestion): persist, then re-scan the store — refresh() notifies
	 * subscribers when the scanned folder changed, so the card view updates
	 * without an Obsidian restart.
	 */
	private applyFolder(value: string): void {
		const folder = value.trim();
		if (folder === this.plugin.settings.eventFolder) return;
		this.plugin.settings.eventFolder = folder;
		void this.plugin.saveSettings();
		void this.plugin.store.refresh();
	}
}
