import { describe, expect, it } from 'vitest';
import { removeNativeCloseButton } from '../../src/card-view/bottom-sheet';

/**
 * Header contract (SPEC-card-view.md): the sheet family never shows a ✕ —
 * Obsidian's native `.modal-close-button` is removed from the DOM in
 * `onOpen`, and any copy Obsidian re-adds while the modal is open is
 * removed by a MutationObserver (JS is the mechanism; styles.css carries no
 * blanket hide rule for it). Phones keep the button (restyled small via CSS).
 */

interface FakeModal {
	modalEl: HTMLElement;
	containerEl: HTMLElement;
	onClose: () => void;
	closed: boolean;
}

function fakeModal(): FakeModal {
	const modalEl = document.createElement('div');
	const containerEl = document.createElement('div');
	containerEl.appendChild(modalEl);
	document.body.appendChild(containerEl);
	const modal: FakeModal = {
		modalEl,
		containerEl,
		onClose: () => {},
		closed: false,
	};
	modal.onClose = () => {
		modal.closed = true;
	};
	return modal;
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('removeNativeCloseButton', () => {
	it('strips every .modal-close-button from the modal element', () => {
		const modal = fakeModal();
		for (const cls of [
			'modal-close-button mod-raised clickable-icon',
			'modal-close-button tappable mod-raised clickable-icon',
		]) {
			const button = document.createElement('div');
			button.className = cls;
			modal.modalEl.appendChild(button);
		}
		const content = document.createElement('div');
		content.className = 'modal-content countdown-form';
		modal.modalEl.appendChild(content);

		removeNativeCloseButton(modal as never);

		expect(modal.modalEl.querySelectorAll('.modal-close-button')).toHaveLength(0);
		expect(modal.modalEl.querySelector('.countdown-form')).not.toBeNull();
	});

	it('is a no-op when the button is absent', () => {
		const modal = fakeModal();
		expect(() => removeNativeCloseButton(modal as never)).not.toThrow();
	});

	it('removes a button Obsidian re-adds after onOpen', async () => {
		const modal = fakeModal();
		removeNativeCloseButton(modal as never);

		const late = document.createElement('div');
		late.className = 'modal-close-button';
		modal.modalEl.appendChild(late);
		await flush();

		expect(modal.modalEl.querySelectorAll('.modal-close-button')).toHaveLength(0);
	});

	it('stops sweeping once the modal closes (onClose still runs)', async () => {
		const modal = fakeModal();
		removeNativeCloseButton(modal as never);
		modal.onClose();

		const late = document.createElement('div');
		late.className = 'modal-close-button';
		modal.modalEl.appendChild(late);
		await flush();

		expect(modal.modalEl.querySelectorAll('.modal-close-button')).toHaveLength(1);
		expect(modal.closed).toBe(true);
		modal.containerEl.remove();
	});
});
