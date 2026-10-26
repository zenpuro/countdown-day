import type { EventType } from '../date-engine/date-engine';
import type { CountdownEvent } from '../event-store/event';
import { createEventCardEl } from '../card-view/event-card';
import { sortEvents } from '../card-view/sort-filter';
import { t } from '../settings-i18n/i18n';

/**
 * ```countdown code block: option parsing + read-only rendering.
 * Syntax (v1 frozen): one `key: value` per line; `type` = comma-separated
 * list, `limit` = positive integer. Invalid lines are ignored with a single
 * visible warning at the top of the rendered block.
 */

const VALID_TYPES: readonly EventType[] = [
	'countdown',
	'anniversary',
	'birthday',
];

export interface EmbedOptions {
	/** null = all types. */
	types: EventType[] | null;
	/** null = no limit. */
	limit: number | null;
	/** Raw text of ignored invalid lines (rendered as one warning line). */
	warnings: string[];
}

export function parseEmbedOptions(source: string): EmbedOptions {
	const result: EmbedOptions = { types: null, limit: null, warnings: [] };

	for (const rawLine of source.split('\n')) {
		const line = rawLine.trim();
		if (line === '') continue;

		const separator = line.indexOf(':');
		if (separator === -1) {
			result.warnings.push(line);
			continue;
		}
		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();

		if (key === 'type') {
			const tokens = value
				.split(',')
				.map((token) => token.trim().toLowerCase())
				.filter((token) => token !== '');
			const valid = tokens.every((token) =>
				VALID_TYPES.includes(token as EventType),
			);
			if (tokens.length === 0 || !valid) {
				result.warnings.push(line);
				continue;
			}
			result.types = tokens as EventType[];
		} else if (key === 'limit') {
			const n = Number(value);
			if (!Number.isInteger(n) || n <= 0) {
				result.warnings.push(line);
				continue;
			}
			result.limit = n;
		} else {
			result.warnings.push(line);
		}
	}

	return result;
}

export interface RenderEmbedOptions {
	/** Raw code-block body. */
	source: string;
	/** Current store events. */
	events: CountdownEvent[];
	/** Called when a card body is clicked. */
	onOpenEvent?: (event: CountdownEvent) => void;
}

/** Render the embed block into `el` (clears previous content). */
export function renderEmbed(el: HTMLElement, options: RenderEmbedOptions): void {
	while (el.firstChild) el.removeChild(el.firstChild);
	el.classList.add('countdown-embed');

	const parsed = parseEmbedOptions(options.source);

	if (parsed.warnings.length > 0) {
		const warning = createDiv();
		warning.className = 'countdown-embed__warning';
		warning.textContent = t('embed-block.invalidOptions', {
			lines: parsed.warnings.join('; '),
		});
		el.append(warning);
	}

	let events = options.events;
	if (parsed.types) {
		// a card matching ANY selected type
		events = events.filter((event) => parsed.types!.includes(event.type));
	}
	events = sortEvents(events);
	if (parsed.limit !== null) events = events.slice(0, parsed.limit);

	if (events.length === 0) {
		const empty = createDiv();
		empty.className = 'countdown-embed__empty';
		empty.textContent = t('embed-block.empty');
		el.append(empty);
		return;
	}

	const grid = createDiv();
	grid.className = 'countdown-grid countdown-embed__grid';
	for (const event of events) {
		const card = createEventCardEl(event, { actions: false });
		card.classList.add('countdown-card--clickable');
		if (options.onOpenEvent) {
			card.addEventListener('click', () => options.onOpenEvent?.(event));
		}
		grid.append(card);
	}
	el.append(grid);
}
