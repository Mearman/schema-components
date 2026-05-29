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
 * Characters the path joiners (`react/SchemaComponent.joinPath`,
 * `html/a11y.joinPath`) emit between segments — `.` between object
 * keys, `[` / `]` around array indices. The disambiguator below treats
 * these as benign structural separators: collapsing them into a hyphen
 * is part of the canonical id form and does NOT signal a collision
 * risk, so no hash suffix is appended for paths like `user.preferences`
 * or `tags[0]`. ASCII whitespace is included for the same reason —
 * label-derived suffixes may carry incidental whitespace.
 */
const STRUCTURAL_SEPARATOR_PATTERN = /^[.[\]\s]+$/;

/**
 * Normalise a structural path into the id segment used after the `sc-`
 * prefix. Whitelist-based: any run of characters outside `[A-Za-z0-9_-]`
 * collapses to a single hyphen, with trailing hyphens stripped.
 *
 * Whitelist (not blacklist) so unexpected characters from free-text sources
 * — `meta.description`, label-derived suffixes, encoded JSON Pointers —
 * cannot leak into ids and break CSS selectors or aria associations.
 *
 * Non-ASCII inputs (e.g. CJK property names like `名前`, accented Latin
 * like `café`, emoji like `🦄`) collapse under the whitelist to a short
 * or empty string and would silently collide on `sc-`. To keep ids
 * deterministic AND unique per input, the normaliser appends a short
 * hash suffix derived from the original string whenever the whitelisted
 * collapse:
 *
 *   - produces an empty string, OR
 *   - dropped non-structural characters from the input (i.e. anything
 *     besides the path joiners `.`, `[`, `]` and ASCII whitespace).
 *
 * Structural separator runs do NOT trigger the disambiguator so
 * canonical paths like `user.preferences` and `tags[0]` keep their
 * historic readable form (`user-preferences`, `tags-0`).
 *
 * The hash is a 32-bit FNV-1a variant rendered in base-36. It is
 * deterministic (same input → same output), short (≤ 7 characters), and
 * non-cryptographic — collision resistance is good enough for DOM ids,
 * and a cryptographic primitive is unnecessary and not universally
 * available (no `crypto` global in every JS runtime that consumes the
 * library).
 *
 * The leading character is guaranteed to be an ASCII letter so the full
 * `sc-<segment>` id is always a valid CSS identifier and `querySelector`
 * target. Empty-collapse inputs receive a synthetic `u` (for "unicode")
 * prefix on the hash so the id never starts with a digit.
 */
export function normaliseIdSegment(value: string): string {
    const collapsed = value
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/-+$/g, "");
    // Empty collapse → derive the entire segment from a deterministic
    // hash so non-ASCII names like `名前` or `🦄` never collide on `sc-`.
    if (collapsed.length === 0) {
        return `u${hashSuffix(value)}`;
    }
    // Non-empty collapse but the whitelist dropped characters from the
    // original. If everything dropped was a known structural separator,
    // the collapse is canonical and no disambiguation is needed.
    // Otherwise distinct inputs (e.g. `café` and `cafè`) might collapse
    // to the same prefix; append a hash so the segment stays unique
    // while preserving the human-readable prefix.
    if (collapsed !== value && droppedNonStructural(value)) {
        return `${collapsed}-${hashSuffix(value)}`;
    }
    return collapsed;
}

/**
 * True when `value` contains at least one character outside both the
 * id whitelist `[A-Za-z0-9_-]` and the structural separator set
 * (`.`, `[`, `]`, ASCII whitespace). Used by `normaliseIdSegment` to
 * decide whether a non-canonical dropped character (a real Unicode
 * character, a label-derived punctuation, etc.) means the collapse is
 * lossy and disambiguation is required.
 */
function droppedNonStructural(value: string): boolean {
    // Strip whitelisted characters first, then check whether anything
    // remaining is non-structural. Cheaper than scanning twice.
    const nonWhitelisted = value.replace(/[A-Za-z0-9_-]+/g, "");
    if (nonWhitelisted.length === 0) return false;
    return !STRUCTURAL_SEPARATOR_PATTERN.test(nonWhitelisted);
}

/**
 * Deterministic 32-bit FNV-1a hash of `value` rendered in base-36. Used
 * solely to disambiguate id segments that would otherwise collide after
 * the whitelisted character collapse; not security-sensitive, so a
 * non-cryptographic hash is sufficient and avoids depending on platform
 * `crypto` availability.
 */
function hashSuffix(value: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        // FNV prime; emulate 32-bit overflow via `Math.imul`.
        hash = Math.imul(hash, 0x01000193);
    }
    // `>>> 0` re-interprets the result as an unsigned 32-bit integer so
    // the base-36 string never carries a leading `-`.
    return (hash >>> 0).toString(36);
}

/**
 * Build the canonical `sc-`-prefixed DOM id for a structural path. Use
 * this as the base id for an input element; derived ids (panel, tab,
 * hint) compose suffixes onto the returned string.
 *
 * An empty `path` is permitted — it surfaces as the bare prefix `sc-`
 * so a leaf renderer at the schema root (e.g.
 * `renderToHtml(z.string())`) still emits a usable id without throwing.
 * Container renderers always thread a non-empty path through
 * `renderChild`, so the empty-id case can never produce sibling
 * collisions inside a structured form.
 */
export function fieldDomId(path: string): string {
    if (path.length === 0) return SC_ID_PREFIX;
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

// ---------------------------------------------------------------------------
// Path threading
// ---------------------------------------------------------------------------

/**
 * Append a child path suffix to a parent path. When the suffix is omitted
 * (e.g. transparent wrappers like union options), the parent path is
 * returned unchanged so the child inherits the parent's id.
 *
 * Bracketed array indices like `[0]` append directly so `tags` + `[0]`
 * becomes `tags[0]` rather than `tags.[0]` — matching the canonical form
 * used by `core/fieldPath.ts` `resolvePath`, which already parses bracket
 * notation when navigating WalkedField trees.
 *
 * This is the single authoritative implementation. The copies in
 * `react/SchemaComponent.tsx`, `html/a11y.ts`, `solid/SchemaComponent.tsx`,
 * and `vue/idPrefix.ts` are kept for backward compatibility but delegate
 * here.
 */
export function joinPath(parent: string, suffix: string | undefined): string {
    if (suffix === undefined || suffix.length === 0) return parent;
    if (parent.length === 0) return suffix;
    if (suffix.startsWith("[")) return `${parent}${suffix}`;
    return `${parent}.${suffix}`;
}

/**
 * Normalise a framework `useId()`-style value into a DOM-id-safe prefix.
 * Framework `useId` implementations often return values containing `:` or
 * other characters that are invalid in CSS selectors. This function replaces
 * any run of non-alphanumeric characters with a single hyphen and trims
 * leading/trailing hyphens.
 *
 * Throws when the sanitised result is empty so callers receive an actionable
 * error rather than a silent empty-string id.
 */
export function sanitisePrefix(value: string): string {
    const sanitised = value
        .replace(/[^a-zA-Z0-9_]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (sanitised.length === 0) {
        throw new Error(
            `Cannot derive a DOM-safe id prefix from "${value}". Pass an explicit idPrefix prop.`
        );
    }
    return sanitised;
}
