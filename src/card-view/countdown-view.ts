import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type CountdownDayPlugin from '../main';
import { closeOpenSwipe, createEventRowEl } from './event-card';
import { setModalTabHost } from './bottom-sheet';
import { ConfirmModal } from './confirm-modal';
import { EventFormModal } from './event-form-modal';
import { filterEvents, sortEvents, type FilterTab } from './sort-filter';
import { t } from '../settings-i18n/i18n';

export const VIEW_TYPE_COUNTDOWN = 'countdown-day-view';

const TABS: readonly FilterTab[] = [
	'all',
	'countdown',
	'anniversary',
	'birthday',
];

/**
 * Main tab view: filter tabs + sorted read-only list rows (reference UI),
 * re-rendered on every event-store change. A floating action button
 * (bottom-right) opens the new-event form. Empty state points users at the
 * events folder.
 */
export class CountdownView extends ItemView {
	private readonly plugin: CountdownDayPlugin;
	private activeTab: FilterTab = 'all';
	private unsubscribe?: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: CountdownDayPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_COUNTDOWN;
	}

	getDisplayText(): string {
		return t('card-view.viewTitle');
	}

	getIcon(): string {
		return 'calendar-clock';
	}

	async onOpen(): Promise<void> {
		this.unsubscribe = this.plugin.store.subscribe(() => this.render());
		// plugin modals (form/sheets/confirm/note prompt) center on this tab
		setModalTabHost(this.containerEl);
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		setModalTabHost(null);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('countdown-day-view');

		// tapping empty space closes any open swipe row
		contentEl.addEventListener('click', (e) => {
			if (!(e.target instanceof Element) || !e.target.closest('.countdown-card-swipe')) {
				closeOpenSwipe();
			}
		});

		this.renderTabs();

		const events = filterEvents(
			sortEvents(this.plugin.store.getEvents()),
			this.activeTab,
		);

		if (events.length === 0) {
			const empty = contentEl.createDiv({ cls: 'countdown-empty' });
			empty.createDiv({ cls: 'countdown-empty__title', text: t('card-view.empty.title') });
			empty.createDiv({
				cls: 'countdown-empty__hint',
				text: t('card-view.empty.hint', {
					folder: this.plugin.settings.eventFolder,
				}),
			});
		} else {
			const list = contentEl.createDiv({ cls: 'countdown-list' });
			for (const event of events) {
				list.append(
					createEventRowEl(event, {
						onEdit: (e) => this.openForm(e),
						onDelete: (e) => this.confirmDelete(e),
						onOpenNote: (e) => void this.openLinkedNote(e),
						onPin: (e) => void this.plugin.store.setPinned(e.path, !e.pinned),
					}),
				);
			}
		}

		this.renderFab();
	}

	private renderFab(): void {
		const wrap = this.contentEl.createDiv({ cls: 'countdown-fab-wrap' });
		const fab = wrap.createEl('button', {
			cls: 'countdown-fab',
			text: '+',
		});
		fab.setAttribute('aria-label', t('card-view.newEvent'));
		fab.addEventListener('click', () => this.openForm());
	}

	private confirmDelete(event: import('../event-store/event').CountdownEvent): void {
		new ConfirmModal(this.app, {
			message: t('card-view.delete.message', { name: event.name }),
			onConfirm: () => this.plugin.store.deleteEvent(event.path),
		}).open();
	}

	/** Open the event's linked note ("[[target|alias]]" → first matching file). */
	private async openLinkedNote(event: import('../event-store/event').CountdownEvent): Promise<void> {
		const link = event.note?.replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
		if (!link) return;
		const target = this.app.metadataCache.getFirstLinkpathDest(link, event.path);
		if (!target) {
			new Notice(t('card-view.noteNotFound'));
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(target);
	}

	private openForm(editing?: import('../event-store/event').CountdownEvent): void {
		new EventFormModal(this.app, {
			editing,
			onSubmit: async (fileName, input) => {
				if (editing) {
					const newPath = await this.plugin.store.renameEvent(editing.path, fileName);
					await this.plugin.store.updateEvent(newPath, input);
				} else {
					await this.plugin.store.createEvent(fileName, input);
				}
			},
		}).open();
	}

	private renderTabs(): void {
		const tabs = this.contentEl.createDiv({ cls: 'countdown-tabs' });
		for (const tab of TABS) {
			const button = tabs.createEl('button', {
				cls: `countdown-tabs__tab${tab === this.activeTab ? ' is-active' : ''}`,
				text: t(`card-view.filter.${tab}` as never),
			});
			button.addEventListener('click', () => {
				this.activeTab = tab;
				this.render();
			});
		}
	}
}
