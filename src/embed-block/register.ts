import { MarkdownRenderChild, TFile } from 'obsidian';
import type CountdownDayPlugin from '../main';
import { renderEmbed } from './embed-block';

/**
 * Live ```countdown code block: re-renders on every event-store change.
 * Detached blocks (note closed/re-rendered) are torn down via onunload,
 * which unsubscribes from the store.
 */
class CountdownEmbedChild extends MarkdownRenderChild {
	private readonly plugin: CountdownDayPlugin;
	private readonly source: string;
	private unsubscribe?: () => void;

	constructor(
		containerEl: HTMLElement,
		plugin: CountdownDayPlugin,
		source: string,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
	}

	onload(): void {
		this.render();
		this.unsubscribe = this.plugin.store.subscribe(() => this.render());
	}

	onunload(): void {
		this.unsubscribe?.();
	}

	private render(): void {
		// No isConnected guard here: onload can fire while the container is
		// still detached (hover previews, canvas, some reading-mode pipelines).
		// Skipping then would leave the block permanently blank — the store may
		// never notify again. Rendering into a detached node is harmless; it
		// simply shows the content once attached.
		renderEmbed(this.containerEl, {
			source: this.source,
			events: this.plugin.store.getEvents(),
			onOpenEvent: (event) => void this.openEvent(event.path),
		});
	}

	private async openEvent(path: string): Promise<void> {
		const file = this.plugin.app.vault.getFileByPath(path);
		if (file instanceof TFile) {
			await this.plugin.app.workspace.getLeaf(false).openFile(file);
		}
	}
}

/** Register the ```countdown markdown code block processor. */
export function registerEmbedBlock(plugin: CountdownDayPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor(
		'countdown',
		(source, el, ctx) => {
			ctx.addChild(new CountdownEmbedChild(el, plugin, source));
		},
	);
}
