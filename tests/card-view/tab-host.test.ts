import { afterEach, describe, expect, it } from 'vitest';
import {
	setModalTabHost,
	mountModalInTab,
} from '../../src/card-view/bottom-sheet';

/**
 * Centering contract (issue: modals centered on the whole app window):
 * on desktop every plugin modal re-parents into the plugin tab's leaf
 * content, so the dialog and its backdrop cover just the tab. Obsidian's
 * `.modal-container` is position:absolute, so reparenting is all it takes.
 * Mobile keeps full-window sheets (Platform.isMobile short-circuits; not
 * exercised here since the obsidian stub is desktop).
 */
describe('mountModalInTab', () => {
	const cleanup: HTMLElement[] = [];
	afterEach(() => {
		setModalTabHost(null);
		for (const el of cleanup.splice(0)) el.remove();
	});

	it('re-parents the overlay into the tab host, idempotently', () => {
		const host = document.createElement('div');
		document.body.append(host);
		cleanup.push(host);
		setModalTabHost(host);

		const containerEl = document.createElement('div');
		document.body.append(containerEl);
		cleanup.push(containerEl);

		const modal = { containerEl } as never;
		mountModalInTab(modal);
		expect(containerEl.parentElement).toBe(host);

		mountModalInTab(modal);
		expect(containerEl.parentElement).toBe(host);
		expect(host.children).toHaveLength(1);
	});

	it('keeps the overlay at body level when no host is set', () => {
		const containerEl = document.createElement('div');
		document.body.append(containerEl);
		cleanup.push(containerEl);

		mountModalInTab({ containerEl } as never);
		expect(containerEl.parentElement).toBe(document.body);
	});

	it('ignores a host that has left the DOM (view closed)', () => {
		const detached = document.createElement('div');
		setModalTabHost(detached);

		const containerEl = document.createElement('div');
		document.body.append(containerEl);
		cleanup.push(containerEl);

		mountModalInTab({ containerEl } as never);
		expect(containerEl.parentElement).toBe(document.body);
	});
});
