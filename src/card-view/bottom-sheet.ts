import { App, Modal, Platform } from 'obsidian';
import { t } from '../settings-i18n/i18n';

/** Element plugin modals center in (the plugin tab); null = the app window. */
let tabHost: HTMLElement | null = null;

/**
 * Designate the element all plugin modals should center in — the plugin
 * tab's leaf content. The view sets it while it is open; every plugin
 * modal (form, sheets, confirm, note prompt) mounts into it.
 */
export function setModalTabHost(host: HTMLElement | null): void {
	tabHost = host;
}

/**
 * Desktop: re-parent the modal overlay into the tab host so the dialog and
 * its dimmed backdrop cover just the plugin tab instead of the whole app
 * window. Obsidian's `.modal-container`/`.modal-bg` are `position:absolute`,
 * so they track the nearest positioned ancestor — the leaf content, which is
 * already `position: relative`. Mobile is untouched (full-window bottom
 * sheets). Call from onOpen, after Obsidian appended the container to body.
 */
export function mountModalInTab(modal: Modal): void {
	if (Platform.isMobile || !tabHost?.isConnected) return;
	if (modal.containerEl.parentElement !== tabHost) {
		tabHost.appendChild(modal.containerEl);
	}
}

/** Apply bottom-sheet styling to any Modal (used by EventFormModal too). */
export function styleAsBottomSheet(modal: Modal): void {
	modal.containerEl.addClass('countdown-sheet-container');
	modal.modalEl.addClass('countdown-sheet');
	removeNativeCloseButton(modal);
	attachSheetDragToClose(modal);
}

/**
 * Mobile: drag the sheet down by its grabber/header to dismiss — the native
 * bottom-sheet gesture. Dragging starts only on the sheet chrome (the
 * grabber zone — the sheet element above the content — or the header row),
 * never from the scrollable body or form controls, so body scrolling is
 * untouched. A quick downward flick dismisses even below the distance
 * threshold. Desktop is skipped: there the sheet is a centered dialog with
 * no grabber.
 */
export function attachSheetDragToClose(modal: Modal): void {
	if (!Platform.isMobile) return;
	const sheet = modal.modalEl;
	const DECISION_PX = 8; // vertical travel before a touch becomes a drag
	const dismissPx = (): number => Math.max(80, sheet.offsetHeight * 0.2);

	let tracking = false;
	let dragging = false;
	let startY = 0;
	let prevY = 0;
	let prevT = 0;
	let dy = 0;
	let velocity = 0; // px/ms, positive = downward

	const onTouchStart = (e: TouchEvent): void => {
		if (e.touches.length !== 1) return;
		const target = e.target as HTMLElement | null;
		if (!target) return;
		if (target !== sheet && !target.closest('.countdown-sheet__header')) return;
		tracking = true;
		dragging = false;
		startY = prevY = e.touches[0].clientY;
		prevT = e.timeStamp;
		dy = 0;
		velocity = 0;
	};

	const onTouchMove = (e: TouchEvent): void => {
		if (!tracking) return;
		const y = e.touches[0].clientY;
		const dt = e.timeStamp - prevT;
		if (dt > 0) {
			velocity = (y - prevY) / dt;
			prevY = y;
			prevT = e.timeStamp;
		}
		dy = y - startY;
		if (!dragging) {
			if (dy <= DECISION_PX) return;
			dragging = true;
			// take over from the open animation; follow the finger 1:1
			sheet.style.transition = 'none';
			sheet.style.willChange = 'transform';
		}
		e.preventDefault();
		// the gesture is ours: hide it from Obsidian's edge-swipe handlers
		e.stopPropagation();
		sheet.style.transform = `translateY(${Math.max(dy, 0)}px)`;
	};

	const onTouchEnd = (): void => {
		if (!tracking) return;
		tracking = false;
		if (!dragging) return;
		dragging = false;
		const flick = velocity > 0.5 && dy > 24;
		if (dy >= dismissPx() || flick) {
			sheet.style.transition = 'transform 0.18s ease-in';
			sheet.style.transform = 'translateY(100%)';
			window.setTimeout(() => {
				// guard: the sheet may have been closed another way mid-animation
				if (modal.containerEl.isConnected) modal.close();
			}, 170);
			return;
		}
		sheet.style.transition = 'transform 0.2s ease';
		sheet.style.transform = '';
		window.setTimeout(() => {
			sheet.style.transition = '';
			sheet.style.willChange = '';
		}, 220);
	};

	sheet.addEventListener('touchstart', onTouchStart, { passive: true });
	sheet.addEventListener('touchmove', onTouchMove, { passive: false });
	sheet.addEventListener('touchend', onTouchEnd);
	sheet.addEventListener('touchcancel', onTouchEnd);

	const previousOnClose = modal.onClose.bind(modal);
	modal.onClose = (): void => {
		sheet.removeEventListener('touchstart', onTouchStart);
		sheet.removeEventListener('touchmove', onTouchMove);
		sheet.removeEventListener('touchend', onTouchEnd);
		sheet.removeEventListener('touchcancel', onTouchEnd);
		previousOnClose();
	};
}

/**
 * Obsidian renders a native ✕ (`.modal-close-button`) in every Modal — top
 * right on desktop, over the sheet header on phones. On desktop the button
 * is removed from the DOM, and a MutationObserver removes any copy Obsidian
 * re-adds while the modal is open (some flows append it after `onOpen`).
 * Phones are excluded: the mobile chrome insists on its ✕, so there it is
 * merely restyled small via CSS instead of removed.
 */
export function removeNativeCloseButton(modal: Modal): void {
	const sweep = (): void => {
		modal.modalEl
			.querySelectorAll('.modal-close-button')
			.forEach((button) => button.remove());
	};
	sweep();
	if (Platform.isMobile) return;

	const observer = new MutationObserver(sweep);
	observer.observe(modal.containerEl, { childList: true, subtree: true });
	// disconnect when the modal closes (shadow the instance's onClose)
	const previousOnClose = modal.onClose.bind(modal);
	modal.onClose = (): void => {
		observer.disconnect();
		previousOnClose();
	};
}

/**
 * Base class for bottom-sheet popups stacked on top of other modals (e.g.
 * the event form). Obsidian Modals already stack with proper layering and
 * Escape handling; this subclass only re-styles the container so the sheet
 * hugs the bottom edge and slides up on open (see `countdown-sheet*` CSS).
 * On phones the sheet also dismisses by dragging the grabber/header down.
 *
 * Header contract (no ✕ button anywhere): [取消] [title] [确定?].
 * - 取消 always closes without applying anything.
 * - 确定 renders by default and calls `onSheetConfirm()` (override to apply
 *   state; the default just closes — e.g. a calendar grid sheet).
 * - `header: false` renders no built-in header — the subclass draws its own
 *   (the event form does: 取消 / title / 保存).
 */
export interface BottomSheetOptions {
	/** Centered header title; omitted when empty. */
	title?: string;
	/** false = no built-in header (subclass draws its own). */
	header?: boolean;
	/** Confirm button label; defaults to 确定. */
	confirmLabel?: string;
}

let sheetTitleSeq = 0;

export abstract class BottomSheetModal extends Modal {
	protected readonly sheetOptions: BottomSheetOptions;
	private confirmBtn?: HTMLButtonElement;

	constructor(app: App, options: BottomSheetOptions = {}) {
		super(app);
		this.sheetOptions = options;
	}

	onOpen(): void {
		this.containerEl.addClass('countdown-sheet-container');
		this.modalEl.addClass('countdown-sheet');
		this.modalEl.setAttribute('role', 'dialog');
		removeNativeCloseButton(this);
		attachSheetDragToClose(this);
		mountModalInTab(this);

		if (this.sheetOptions.header !== false) {
			const header = this.contentEl.createDiv({ cls: 'countdown-sheet__header' });
			const cancel = header.createEl('button', {
				cls: 'countdown-sheet__cancel',
				text: t('card-view.form.cancel'),
			});
			cancel.addEventListener('click', () => this.close());

			const title = header.createDiv({
				cls: 'countdown-sheet__title',
				text: this.sheetOptions.title ?? '',
			});
			// Obsidian renders aria-label as a hover tooltip; name the dialog
			// via the visible title instead (aria-label would label + tooltip).
			if (this.sheetOptions.title) {
				const titleId = `countdown-sheet-title-${++sheetTitleSeq}`;
				title.setAttribute('id', titleId);
				this.modalEl.setAttribute('aria-labelledby', titleId);
			}

			if (this.useConfirmButton()) {
				this.confirmBtn = header.createEl('button', {
					cls: 'countdown-sheet__confirm',
					text: this.sheetOptions.confirmLabel ?? t('card-view.sheet.done'),
				});
				this.confirmBtn.addEventListener('click', () => this.onSheetConfirm());
			} else {
				// keep the title centered when there is no confirm button
				header.createDiv({ cls: 'countdown-sheet__cancel countdown-sheet__ghost' });
			}
		}

		this.renderSheet(this.contentEl.createDiv({ cls: 'countdown-sheet__body' }));
		this.onSheetOpened();
	}

	/** Toggle the header 确定 button (sheets with multi-select state). */
	protected setConfirmEnabled(enabled: boolean): void {
		this.confirmBtn?.toggleAttribute('disabled', !enabled);
	}

	/** Called after the body rendered; subclasses sync initial confirm state. */
	protected onSheetOpened(): void {}

	/** True (default) → the header shows 确定; grids may opt out. */
	protected useConfirmButton(): boolean {
		return true;
	}

	/** 确定 pressed — apply state, then close. Default: close. */
	protected onSheetConfirm(): void {
		this.close();
	}

	/** Sheet content — subclasses render into `body`. */
	protected abstract renderSheet(body: HTMLElement): void;
}
