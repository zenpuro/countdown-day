import { App, Modal } from 'obsidian';
import { t } from '../settings-i18n/i18n';
import { removeNativeCloseButton, mountModalInTab } from './bottom-sheet';

/**
 * Small confirmation dialog (used before moving an event to the trash).
 * Restyled to match the bottom-sheet family: an iOS-style alert card —
 * centered message, then a footer row of two equal actions separated by
 * hairlines, the destructive one in the error colour. No Setting chrome,
 * no ✕ button.
 */
let confirmMessageSeq = 0;

export class ConfirmModal extends Modal {
	private readonly message: string;
	private readonly onConfirm: () => void | Promise<void>;

	constructor(
		app: App,
		options: { message: string; onConfirm: () => void | Promise<void> },
	) {
		super(app);
		this.message = options.message;
		this.onConfirm = options.onConfirm;
	}

	onOpen(): void {
		this.containerEl.addClass('countdown-confirm-container');
		this.modalEl.addClass('countdown-confirm');
		this.modalEl.setAttribute('role', 'alertdialog');
		removeNativeCloseButton(this);
		mountModalInTab(this);

		const { contentEl } = this;
		const message = contentEl.createEl('p', {
			cls: 'countdown-confirm__message',
			text: this.message,
		});
		// Obsidian renders aria-label as a hover tooltip; name the dialog
		// via the visible message instead (aria-label would label + tooltip).
		const messageId = `countdown-confirm-message-${++confirmMessageSeq}`;
		message.setAttribute('id', messageId);
		this.modalEl.setAttribute('aria-labelledby', messageId);

		const actions = contentEl.createDiv({ cls: 'countdown-confirm__actions' });
		const cancel = actions.createEl('button', {
			cls: 'countdown-confirm__btn',
			text: t('card-view.delete.cancel'),
		});
		cancel.addEventListener('click', () => this.close());
		const confirm = actions.createEl('button', {
			cls: 'countdown-confirm__btn countdown-confirm__btn--danger',
			text: t('card-view.delete.confirm'),
		});
		confirm.addEventListener('click', () => {
			void this.onConfirm();
			this.close();
		});

		// destructive dialog: the safe choice gets focus first
		cancel.focus();
	}
}
