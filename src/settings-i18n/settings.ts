/** Plugin settings — MVP has a single option (see SPEC-settings-i18n.md). */

export interface CountdownSettings {
	/** Root folder event files are scanned from. */
	eventFolder: string;
}

export const DEFAULT_SETTINGS: CountdownSettings = {
	eventFolder: 'Countdowns',
};

/**
 * Merge persisted settings (unknown shape, from plugin data JSON) over the
 * defaults. Wrong-typed values fall back to defaults rather than leaking
 * invalid state into the plugin.
 */
export function mergeWithDefaults(loaded: unknown): CountdownSettings {
	const data = (loaded ?? {}) as Partial<Record<keyof CountdownSettings, unknown>>;
	return {
		eventFolder:
			typeof data.eventFolder === 'string' && data.eventFolder.length > 0
				? data.eventFolder
				: DEFAULT_SETTINGS.eventFolder,
	};
}
