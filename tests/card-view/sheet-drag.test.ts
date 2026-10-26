import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachSheetDragToClose } from '../../src/card-view/bottom-sheet';
import { Platform } from '../mocks/obsidian';

/**
 * Mobile bottom sheets dismiss by dragging the grabber/header down. The
 * gesture must only start on the sheet chrome — never from the scrollable
 * body — and a fast downward flick dismisses below the distance threshold.
 */

interface FakeModal {
	modalEl: HTMLElement;
	containerEl: HTMLElement;
	onClose: () => void;
	closed: boolean;
	close: () => void;
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
		close() {
			modal.closed = true;
			modal.onClose();
		},
	};
	return modal;
}

/** Dispatch a synthetic touch sequence event (jsdom has no TouchEvent). */
function touch(
	type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
	target: HTMLElement,
	opts: { y?: number; at?: number } = {},
): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'timeStamp', { value: opts.at ?? 0 });
	Object.defineProperty(event, 'touches', {
		value: [{ clientY: opts.y ?? 0 }],
	});
	target.dispatchEvent(event);
	return event;
}

function el(
	parent: HTMLElement,
	tag: string,
	className?: string,
): HTMLElement {
	const node = document.createElement(tag);
	if (className) node.className = className;
	parent.appendChild(node);
	return node;
}

beforeEach(() => {
	Platform.isMobile = true;
	vi.useFakeTimers();
});

afterEach(() => {
	Platform.isMobile = false;
	vi.useRealTimers();
	document.body.innerHTML = '';
});

describe('attachSheetDragToClose', () => {
	it('drag from the grabber zone past the threshold dismisses the sheet', () => {
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);

		touch('touchstart', modal.modalEl, { y: 300, at: 0 });
		touch('touchmove', modal.modalEl, { y: 420, at: 80 });
		expect(modal.modalEl.style.transform).toBe('translateY(120px)');

		touch('touchend', modal.modalEl);
		// slide-out animation runs first, then close
		expect(modal.modalEl.style.transform).toBe('translateY(100%)');
		vi.advanceTimersByTime(200);
		expect(modal.closed).toBe(true);
	});

	it('a fast downward flick dismisses below the distance threshold', () => {
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);

		touch('touchstart', modal.modalEl, { y: 100, at: 0 });
		touch('touchmove', modal.modalEl, { y: 140, at: 50 }); // 0.8 px/ms
		touch('touchend', modal.modalEl);

		vi.advanceTimersByTime(200);
		expect(modal.closed).toBe(true);
	});

	it('a short slow drag springs back and stays open', () => {
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);

		touch('touchstart', modal.modalEl, { y: 300, at: 0 });
		touch('touchmove', modal.modalEl, { y: 340, at: 400 }); // slow: 0.1 px/ms
		touch('touchend', modal.modalEl);

		expect(modal.modalEl.style.transform).toBe('');
		vi.advanceTimersByTime(300);
		expect(modal.closed).toBe(false);
	});

	it('dragging from the scrollable body never engages the gesture', () => {
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);
		const body = el(modal.modalEl, 'div', 'countdown-sheet__body');
		const field = el(body, 'div');

		const move = touch('touchmove', field, { y: 500, at: 100 });
		touch('touchend', field);

		expect(move.defaultPrevented).toBe(false);
		expect(modal.modalEl.style.transform).toBe('');
		vi.advanceTimersByTime(300);
		expect(modal.closed).toBe(false);
	});

	it('dragging from the header row dismisses (native sheet feel)', () => {
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);
		const header = el(modal.modalEl, 'div', 'countdown-sheet__header');
		const cancel = el(header, 'button');
		cancel.textContent = '取消';

		touch('touchstart', cancel, { y: 200, at: 0 });
		touch('touchmove', cancel, { y: 360, at: 90 });
		touch('touchend', cancel);

		vi.advanceTimersByTime(200);
		expect(modal.closed).toBe(true);
	});

	it('a tap on a header button never prevents default or closes', () => {
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);
		const header = el(modal.modalEl, 'div', 'countdown-sheet__header');
		const confirm = el(header, 'button');
		confirm.textContent = '确定';

		touch('touchstart', confirm, { y: 200, at: 0 });
		const move = touch('touchmove', confirm, { y: 204, at: 40 }); // under threshold
		touch('touchend', confirm);

		expect(move.defaultPrevented).toBe(false);
		vi.advanceTimersByTime(300);
		expect(modal.closed).toBe(false);
	});

	it('listeners are removed when the modal closes', () => {
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);
		modal.onClose();

		touch('touchstart', modal.modalEl, { y: 300, at: 0 });
		touch('touchmove', modal.modalEl, { y: 500, at: 80 });
		touch('touchend', modal.modalEl);

		expect(modal.modalEl.style.transform).toBe('');
		vi.advanceTimersByTime(300);
		expect(modal.closed).toBe(false);
	});

	it('desktop never attaches the gesture', () => {
		Platform.isMobile = false;
		const modal = fakeModal();
		attachSheetDragToClose(modal as never);

		touch('touchstart', modal.modalEl, { y: 300, at: 0 });
		touch('touchmove', modal.modalEl, { y: 500, at: 80 });
		touch('touchend', modal.modalEl);

		expect(modal.modalEl.style.transform).toBe('');
		vi.advanceTimersByTime(300);
		expect(modal.closed).toBe(false);
	});
});
