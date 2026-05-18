/**
 * Canonical DOM-id generation from structural paths.
 *
 * Every render pipeline (React headless, HTML sync, HTML stream) needs to
 * derive stable DOM ids from the same path so `aria-controls`, `aria-labelledby`,
 * and `htmlFor` references resolve consistently across pipelines.
 *
 * Previously each pipeline carried its own copy with subtly different
 * normalisation (raw path in one place, dot/bracket-collapsed in another,
 * whitelist-collapsed in a third). The streaming renderer's tab panel ids
 * silently diverged from the sync renderer's because of that drift.
 *
 * Pipelines should import the helpers below rather than re-deriving them.
 */

import { SC_ID_PREFIX } from "./cssClasses.ts";

/**
 * Normalise a structural path into the id segment used after the `sc-`
 * prefix. Whitelist-based: any run of characters outside `[A-Za-z0-9_-]`
 * collapses to a single hyphen, with trailing hyphens stripped.
 *
 * Whitelist (not blacklist) so unexpected characters from free-text sources
 * — `meta.description`, label-derived suffixes, encoded JSON Pointers —
 * cannot leak into ids and break CSS selectors or aria associations.
 */
export function normaliseIdSegment(value: string): string {
    return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+$/g, "");
}

/**
 * Build the canonical `sc-`-prefixed DOM id for a structural path.
 * Use this as the base id for an input element; derived ids (panel, tab,
 * hint) compose suffixes onto the returned string.
 *
 * Throws on an empty path: a previous "sc-field" fallback caused every
 * input across a form to share the same id, breaking label-input pairing
 * and screen reader navigation.
 */
export function fieldDomId(path: string): string {
    if (path.length === 0) {
        throw new Error(
            "fieldDomId requires a non-empty path. Thread a root path from the renderer entry point and derive children via joinPath()."
        );
    }
    return `${SC_ID_PREFIX}${normaliseIdSegment(path)}`;
}

/**
 * Derive the constraint-hint element id for a given field id.
 * The hint element is wired to inputs via `aria-describedby`.
 */
export function hintIdFor(fieldId: string): string {
    return `${fieldId}-hint`;
}

/**
 * Derive the tab panel id for a discriminated-union container at `path`.
 * Used by every renderer that emits a WAI-ARIA tabs widget so that the
 * `aria-controls` on each tab and the `id` on the matching panel match.
 */
export function panelIdFor(path: string): string {
    return `${fieldDomId(path)}-panel`;
}

/**
 * Derive the id for tab `i` within a discriminated-union container at `path`.
 * Used to pair `aria-labelledby` on the active panel with the active tab's
 * `id` across all renderers.
 */
export function tabIdFor(path: string, index: number): string {
    return `${fieldDomId(path)}-tab-${String(index)}`;
}
