import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Theme audit guard (SPEC-card-view.md): styles must use Obsidian CSS
 * variables only — zero hardcoded colors, so light/dark/third-party themes
 * all adapt automatically.
 */
describe('styles.css theme audit', () => {
	const css = readFileSync(join(process.cwd(), 'styles.css'), 'utf-8');

	it('contains no hardcoded color literals (hex/rgb/rgba/hsl)', () => {
		expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(css).not.toMatch(/\brgba?\(/);
		expect(css).not.toMatch(/\bhsla?\(/);
	});

	it('uses Obsidian CSS variables', () => {
		expect(css.match(/var\(--/g)?.length ?? 0).toBeGreaterThan(20);
	});

	it('forces a single column on narrow (phone) screens', () => {
		const media = css.match(/@media[^{]*\{[\s\S]*\}/g) ?? [];
		const phoneRule = media.some((block) => /max-width:\s*480px/.test(block) && /1fr/.test(block));
		expect(phoneRule).toBe(true);
	});

	it('centers sheets on PC (body:not(.is-mobile)) while mobile keeps the bottom sheet', () => {
		// base anchoring stays bottom-anchored — the mobile default, untouched
		expect(css).toMatch(/\.countdown-sheet-container\s*\{[^}]*align-items:\s*flex-end/);
		// the desktop app re-presents the same sheet as a centered dialog
		expect(css).toMatch(/body:not\(\.is-mobile\)\s+\.countdown-sheet-container\s*\{[^}]*align-items:\s*center/);
		// full-width sheets are Obsidian-mobile-only, no longer pointer:coarse
		expect(css).toMatch(/body\.is-mobile\s+\.countdown-sheet\s*\{[^}]*width:\s*100%/);
		const coarse = css.match(/@media \(pointer: coarse\) \{[\s\S]*?\n\}/)?.[0] ?? '';
		expect(coarse).not.toContain('.countdown-sheet');
	});

	it('keeps phone sheets full-bleed and form rows on one line', () => {
		// desktop native ✕ removal is owned by JS (removeNativeCloseButton):
		// styles.css must NOT re-hide it behind a blanket display:none rule
		// (covers the whole sheet family: sheet / confirm / note-suggest)
		expect(css).not.toMatch(/\.countdown-(?:sheet|confirm|note-suggest)-container\s+\.modal-close-button[^{}]*\{[^}]*display:\s*none/);
		// mobile sheets run edge to edge: Obsidian's modal inset is beaten
		expect(css).toMatch(/body\.is-mobile\s+\.countdown-sheet-container\s*\{[^}]*padding:\s*0/);
		expect(css).toMatch(/body\.is-mobile\s+\.countdown-sheet\s*\{[^}]*max-width:\s*none/);
		// phone form rows keep the label-left value-right anatomy, at the
		// specificity of Obsidian's `.is-phone .modal .setting-item:not(...)` (0,4,0)
		expect(css).toMatch(/body\.is-mobile\s+\.modal\s+\.countdown-form\s+\.setting-item\s*\{[^}]*flex-direction:\s*row/);
		// the value control may shrink so the label never wraps
		expect(css).toMatch(/body\.is-mobile\s+\.modal\s+\.countdown-form\s+\.setting-item\s+\.setting-item-control\s*\{[^}]*flex:\s*0\s+1\s+auto/);
		// rows stay one line on phones: no wrapping, the value ellipsizes instead
		expect(css).toMatch(/body\.is-mobile\s+\.modal\s+\.countdown-form\s+\.setting-item\s+\.setting-item-control,\s*\nbody\.is-mobile[^{]*\.countdown-form__date-row\s*\{[^}]*flex-wrap:\s*nowrap/);
		expect(css).toMatch(/\.countdown-form__date-text\s*\{[^}]*text-overflow:\s*ellipsis/);
		expect(css).toMatch(/\.countdown-form__date-value\s*\{[^}]*min-width:\s*0/);
		// pinning must not change the row height: the badge carries a fallback
		// size (most themes lack --font-ui-smallest) and stays under the name line
		expect(css).toMatch(/\.countdown-card__pin-badge\s*\{[^}]*font-size:\s*var\(--font-ui-smallest,\s*0\.6875rem\)/);
		expect(css).toMatch(/\.countdown-card__pin-badge\s*\{[^}]*line-height:\s*1\.2/);
		// remind/repeat option rows are flat: the .countdown-sheet prefix must
		// outrank Obsidian's `button:not(.clickable-icon)` (0,1,1) fill+outline
		expect(css).toMatch(/\.countdown-sheet \.countdown-sheet__option\s*\{[^}]*box-shadow:\s*none/);
		expect(css).toMatch(/\.countdown-sheet \.countdown-sheet__option\.is-active\s*\{[^}]*background-color:\s*transparent/);
	});

	it('flattens the alert card children but keeps the card itself', () => {
		// the card keeps Obsidian's default fill + outline — only inner
		// children are chrome-free: flat buttons, no divider hairlines
		expect(css).not.toMatch(/\.countdown-confirm\s*\{[^}]*background-color/);
		expect(css).not.toMatch(/\.countdown-confirm__actions\s*\{[^}]*border/);
		expect(css).not.toMatch(/\.countdown-confirm__btn \+ \.countdown-confirm__btn/);
		expect(css).toMatch(/\.countdown-confirm \.countdown-confirm__btn\s*\{[^}]*background-color:\s*transparent/);
	});

	it('re-asserts the flat family on phones against the mobile chrome', () => {
		// Obsidian's phone css repaints buttons (grey pills + enforced colors)
		// with high-specificity !important rules — the body.is-phone layer must
		// win them back (blanket flat pass, then state colors)
		expect(css).toMatch(/body\.is-phone [^{}]*\.countdown-sheet__option[^{}]*\{[^}]*background-color:\s*transparent !important/);
		expect(css).toMatch(/body\.is-phone [^{}]*\.countdown-fab[^{}]*\{[^}]*background-color:\s*var\(--interactive-accent\) !important/);
		expect(css).toMatch(/body\.is-phone [\s\S]*?\.countdown-sheet__option\.is-active\s*\{[^}]*color:\s*var\(--interactive-accent\) !important/);
	});

	it('quiets the phone close button instead of removing it', () => {
		// desktop/tablet: removal lives in JS, not CSS (no display:none fallback);
		// one guard for the whole sheet family: sheet / confirm / note-suggest
		expect(css).not.toMatch(/\.countdown-(?:sheet|confirm|note-suggest)-container \.modal-close-button[^{}]*\{[^}]*display:\s*none/);
		// phone: small ghost ✕ (28px, transparent, muted ink)
		expect(css).toMatch(/body\.is-phone [^{}]*\.modal-close-button[^{}]*\{[^}]*width:\s*28px !important/);
		expect(css).toMatch(/body\.is-phone [^{}]*\.modal-close-button svg\s*\{[^}]*inline-size:\s*16px/);
	});

	it('keeps horizontal swipes off the app/webview gesture layer', () => {
		expect(css).toMatch(/\.countdown-card-swipe\s*\{[^}]*touch-action:\s*pan-y/);
	});

	it('centers wheel rows in the highlight band and compacts swipe actions', () => {
		// two phantom rows so scrollTop = index × 40 (wheel-picker.ts math)
		expect(css).toMatch(/\.countdown-wheel__scroll\s*\{[^}]*padding:\s*80px 0/);
		// swipe buttons are compact pills, not full-row slabs
		expect(css).toMatch(/\.countdown-card-swipe \.countdown-card-swipe__action\s*\{[^}]*height:\s*56px/);
	});

	it('pushes phone sheet content below the chrome close button', () => {
		expect(css).toMatch(/body\.is-phone \.countdown-sheet\s*\{[^}]*padding-top:\s*1rem/);
	});

	it('prefixes every custom button/input rule past (0,1,1)', () => {
		// Obsidian's `button:not(.clickable-icon)` (0,1,1) would repaint
		// --interactive-normal + input-shadow over any bare-class rule — every
		// custom button chrome rule must carry a container prefix (SPEC).
		const required = [
			'.countdown-day-view .countdown-tabs__tab',
			'.countdown-day-view .countdown-fab',
			'.countdown-card .countdown-card__action',
			'.countdown-card-swipe .countdown-card-swipe__action',
			'.countdown-sheet .countdown-sheet__cancel',
			'.countdown-sheet .countdown-sheet__confirm',
			'.countdown-sheet .countdown-sheet__option',
			'.countdown-sheet .countdown-form__save',
			'.countdown-sheet .countdown-form__seg',
			'.countdown-sheet .countdown-form__date-value',
			'.countdown-sheet .countdown-form__mini-btn',
			'.countdown-sheet .countdown-form__name',
			'.countdown-sheet .countdown-datepicker__nav',
			'.countdown-sheet .countdown-datepicker__cell',
			'.countdown-sheet .countdown-datepicker__today',
			'.countdown-confirm .countdown-confirm__btn',
		];
		for (const selector of required) {
			expect(css).toContain(selector);
		}
		// none of these may survive as bare-class block starters
		const bare = required
			.map((s) => s.split(' ').pop()!)
			.map((cls) => new RegExp(`^${cls.replace(/[.\\]/g, '\\$&')}\\s*\\{`, 'm'));
		for (const pattern of bare) {
			expect(css).not.toMatch(pattern);
		}
	});
});
