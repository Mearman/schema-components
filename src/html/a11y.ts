/**
 * Shared ARIA attribute helpers for HTML renderers.
 *
 * Used by both the synchronous renderer (renderToHtml) and the streaming
 * renderer (renderToHtmlStream) to produce consistent accessibility markup.
 */

import type { FieldConstraints, WalkedField } from "../core/types.ts";

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
    return str
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// ---------------------------------------------------------------------------
// Input ID helpers
// ---------------------------------------------------------------------------

/**
 * Build the input ID for a field at a given path.
 * Matches the id used in <label for="..."> in the object renderers.
 */
export function buildInputId(path: string, key: string): string {
    return `sc-${escapeHtml(path ? `${path}-${key}` : key)}`;
}

/**
 * Derive the hint element ID from the input ID.
 */
export function buildHintId(inputId: string): string {
    return `${inputId}-hint`;
}

// ---------------------------------------------------------------------------
// Constraint descriptions
// ---------------------------------------------------------------------------

/**
 * Build a human-readable constraint description string.
 * Returns undefined if no constraints are present.
 */
export function constraintHint(c: FieldConstraints): string | undefined {
    const parts: string[] = [];
    if (c.minLength !== undefined)
        parts.push(`Minimum ${String(c.minLength)} characters`);
    if (c.maxLength !== undefined)
        parts.push(`Maximum ${String(c.maxLength)} characters`);
    if (c.minimum !== undefined) parts.push(`Minimum ${String(c.minimum)}`);
    if (c.maximum !== undefined) parts.push(`Maximum ${String(c.maximum)}`);
    if (c.pattern !== undefined && c.format === undefined)
        parts.push("Must match pattern");
    if (c.minItems !== undefined)
        parts.push(`Minimum ${String(c.minItems)} items`);
    if (c.maxItems !== undefined)
        parts.push(`Maximum ${String(c.maxItems)} items`);
    if (parts.length === 0) return undefined;
    return parts.join(". ");
}

// ---------------------------------------------------------------------------
// ARIA attribute builders
// ---------------------------------------------------------------------------

/**
 * Build `aria-required` attribute for required fields.
 * A field is required when isOptional is explicitly false.
 */
export function ariaRequired(tree: WalkedField): string {
    if (tree.isOptional === false) return ' aria-required="true"';
    return "";
}

/**
 * Build `aria-describedby` pointing to the constraint hint element.
 * Only emitted when there are constraints to describe.
 */
export function ariaDescribedBy(
    inputId: string,
    constraints: FieldConstraints
): string {
    if (constraintHint(constraints) === undefined) return "";
    return ` aria-describedby="${buildHintId(inputId)}"`;
}

/**
 * Build a constraint hint element for aria-describedby.
 * Returns empty string if no constraints are present.
 */
export function buildHintHtml(
    inputId: string,
    constraints: FieldConstraints
): string {
    const hint = constraintHint(constraints);
    if (hint === undefined) return "";
    return `<small class="sc-hint" id="${buildHintId(inputId)}">${escapeHtml(hint)}</small>`;
}

/**
 * Build the required indicator for labels.
 * Returns empty string if the field is optional.
 */
export function requiredIndicator(field: WalkedField): string {
    if (field.isOptional === false)
        return ' <span class="sc-required" aria-hidden="true">*</span>';
    return "";
}
