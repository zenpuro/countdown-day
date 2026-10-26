import type { CountdownEvent } from '../event-store/event';
import { cardOccurrence, countdownParts, countdownPrefix } from './countdown-text';
import { eventDateLine } from './date-display';
import { t } from '../settings-i18n/i18n';

/**
 * Reusable event row (view list + embed-block share this renderer), styled
 * after the reference UI: name + date line on the left, big day count with
 * 还有/已经 prefix and a 天 unit badge on the right. Highlight when within
 * the remind window (daysUntil <= remind, not expired); weakened style for
 * expired events. Styling lives in styles.css using Obsidian CSS variables.
 */

/** Width of the swipe-revealed action area (px) — must match styles.css. */
const SWIPE_ACTION_WIDTH = 168;
/** Drag distance (px) that snaps the row open — small on purpose. */
const SWIPE_OPEN_THRESHOLD = 28;

export interface CreateCardOptions {
	/** false = read-only card for embed-block (default true). */
	actions?: boolean;
	/** "Now" for countdown computation; defaults to the current time (tests inject). */
	today?: Date;
	/** Card action handlers; buttons render only when actions are enabled. */
	onEdit?: (event: CountdownEvent) => void;
	onDelete?: (event: CountdownEvent) => void;
	onOpenNote?: (event: CountdownEvent) => void;
	/** Pin/unpin toggle (list view only). */
	onPin?: (event: CountdownEvent) => void;
}

/**
 * Event row for the list view: wraps the card in a swipe container. On
 * touch devices a left swipe reveals 置顶/编辑/删除 behind the row (the
 * inline desktop buttons are hidden there via `pointer: coarse` CSS);
 * desktop keeps the always-visible text buttons.
 */
export function createEventRowEl(
	event: CountdownEvent,
	opts: CreateCardOptions = {},
): HTMLElement {
	const swipe = createDiv();
	swipe.className = 'countdown-card-swipe';

	const actions = createDiv();
	actions.className = 'countdown-card-swipe__actions';

	const revealButton = (label: string, extraCls: string, onClick: () => void): void => {
		const button = createEl('button');
		button.className = `countdown-card-swipe__action${extraCls}`;
		button.textContent = label;
		button.addEventListener('click', () => {
			closeOpenSwipe();
			onClick();
		});
		actions.append(button);
	};

	revealButton(
		event.pinned ? t('card-view.action.unpin') : t('card-view.action.pin'),
		'',
		() => opts.onPin?.(event),
	);
	revealButton(t('card-view.action.edit'), '', () => opts.onEdit?.(event));
	revealButton(t('card-view.action.delete'), ' countdown-card-swipe__action--danger', () =>
		opts.onDelete?.(event),
	);

	swipe.append(actions);

	const card = createEventCardEl(event, opts);
	swipe.append(card);
	attachSwipe(swipe, card);

	return swipe;
}

/** One open swipe at a time; the view also closes it on outside taps. */
const SwipeState = {
	close: null as (() => void) | null,
};

/** Close any open swipe row (e.g. the view got tapped outside the row). */
export function closeOpenSwipe(): void {
	SwipeState.close?.();
	SwipeState.close = null;
}

function attachSwipe(swipe: HTMLElement, card: HTMLElement): void {
	let startX = 0;
	let startY = 0;
	let dragging = false;
	let opened = false;

	const apply = (translateX: number, animate: boolean): void => {
		card.classList.toggle('is-animating', animate);
		card.style.transform = translateX === 0 ? '' : `translateX(${translateX}px)`;
	};
	const close = (): void => {
		opened = false;
		apply(0, true);
		if (SwipeState.close === close) SwipeState.close = null;
	};

	card.addEventListener('touchstart', (e) => {
		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		dragging = false;
		// starting a touch on another row closes the currently open one
		closeOpenSwipe();
	}, { passive: true });

	card.addEventListener('touchmove', (e) => {
		const touch = e.touches[0];
		const dx = touch.clientX - startX;
		const dy = touch.clientY - startY;
		if (!dragging) {
			if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return;
			dragging = true;
			// while horizontally swiping, stop the list from scrolling
			e.preventDefault();
		}
		// the gesture is ours: hide it from Obsidian's edge-swipe handlers
		e.stopPropagation();
		const base = opened ? -SWIPE_ACTION_WIDTH : 0;
		const translateX = Math.min(Math.max(base + dx, -SWIPE_ACTION_WIDTH), 0);
		apply(translateX, false);
	}, { passive: false });

	card.addEventListener('touchend', (e) => {
		if (dragging) {
			// swallow the click a drag would produce, and keep the finished
			// gesture away from Obsidian's swipe navigation
			e.preventDefault();
			e.stopPropagation();
			const dx = e.changedTouches[0].clientX - startX;
			const base = opened ? -SWIPE_ACTION_WIDTH : 0;
			opened = base + dx < -SWIPE_OPEN_THRESHOLD;
			if (opened) {
				closeOpenSwipe();
				SwipeState.close = close;
				swipe.classList.add('is-open');
				apply(-SWIPE_ACTION_WIDTH, true);
			} else {
				close();
			}
		} else if (opened) {
			// tapping the card while open closes it (reveal buttons stay clickable)
			close();
		}
	});

	// a finished drag must not trigger a click on the row
	card.addEventListener('click', (e) => {
		if (dragging) {
			e.stopPropagation();
			e.preventDefault();
			dragging = false;
		}
	});

	// some platforms drive their swipe navigation via pointer events —
	// while a row drag is active, hide those from app-level handlers too
	const swallowPointer = (e: PointerEvent): void => {
		if (dragging) e.stopPropagation();
	};
	card.addEventListener('pointermove', swallowPointer);
	card.addEventListener('pointerup', swallowPointer);
}

export function createEventCardEl(
	event: CountdownEvent,
	opts: CreateCardOptions = {},
): HTMLElement {
	const today = opts.today ?? new Date();
	const occurrence = cardOccurrence(event, today);
	// anniversary count-ups read as live (已经 N 天) even though the engine
	// reports next = null for their past anchor — not a weakened expired row
	const expired = occurrence.next === null && event.type !== 'anniversary';
	const parts = countdownParts(occurrence);

	const card = createDiv();
	card.classList.add('countdown-card');
	if (expired) card.classList.add('countdown-card--expired');
	if (event.pinned) card.classList.add('countdown-card--pinned');
	if (
		!expired &&
		occurrence.daysUntil >= 0 &&
		event.remind !== undefined &&
		event.remind.length > 0 &&
		occurrence.daysUntil <= Math.max(...event.remind)
	) {
		card.classList.add('countdown-card--highlight');
	}

	const body = createDiv();
	body.className = 'countdown-card__body';

	const nameRow = createDiv();
	nameRow.className = 'countdown-card__name-row';

	const name = createDiv();
	name.className = 'countdown-card__name';
	name.textContent = event.name;
	nameRow.append(name);

	if (event.pinned) {
		const badge = createSpan();
		badge.className = 'countdown-card__pin-badge';
		badge.textContent = t('card-view.pinBadge');
		nameRow.append(badge);
	}

	body.append(nameRow);

	const meta = createDiv();
	meta.className = 'countdown-card__meta';
	meta.textContent = eventDateLine(event, occurrence);
	body.append(meta);

	card.append(body);

	const count = createDiv();
	count.className = 'countdown-card__count';

	const prefix = createSpan();
	prefix.className = 'countdown-card__prefix';
	prefix.textContent = countdownPrefix(parts.kind);
	count.append(prefix);

	if (parts.days !== null) {
		const days = createSpan();
		days.className = 'countdown-card__days';
		days.textContent = String(parts.days);
		count.append(days);

		const unit = createSpan();
		unit.className = 'countdown-card__unit';
		unit.textContent = t('card-view.unit.day');
		count.append(unit);
	}

	card.append(count);

	if (opts.actions !== false) {
		const actions = createDiv();
		actions.className = 'countdown-card__actions';

		// no aria-label on these: the visible text already names the button,
		// and Obsidian renders aria-label as a hover tooltip
		const addAction = (label: string, onClick: () => void): void => {
			const button = createEl('button');
			button.className = 'countdown-card__action';
			button.textContent = label;
			button.addEventListener('click', () => onClick());
			actions.append(button);
		};

		if (opts.onPin) {
			addAction(event.pinned ? t('card-view.action.unpin') : t('card-view.action.pin'), () =>
				opts.onPin?.(event),
			);
		}
		if (event.note && opts.onOpenNote) {
			addAction(t('card-view.action.note'), () => opts.onOpenNote?.(event));
		}
		if (opts.onEdit) {
			addAction(t('card-view.action.edit'), () => opts.onEdit?.(event));
		}
		if (opts.onDelete) {
			addAction(t('card-view.action.delete'), () => opts.onDelete?.(event));
		}

		card.append(actions);
	}

	return card;
}
