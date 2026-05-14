/**
 * Shared ARIA helpers for HTML renderers.
 *
 * These return structured data (attribute objects, child nodes) that work
 * with the typed `h()` builder in `html.ts`. No string templates here.
 *
 * Used by both the synchronous renderer (renderToHtml) and the streaming
 * renderer (renderToHtmlStream) to produce consistent accessibility markup.
 */

import type { FieldConstraints, WalkedField } from "../core/types.ts";
import { h, type HtmlAttributes, type HtmlNode } from "./html.ts";

// ---------------------------------------------------------------------------
// Input ID helpers
// ---------------------------------------------------------------------------

/**
 * Build the input ID for a field at a given path.
 */
export function buildInputId(path: string, key: string): string {
    const raw = path ? `${path}-${key}` : key;
    // IDs are alphanumeric + hyphens, no need for full HTML escaping
    return `sc-${raw}`;
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
// ARIA attribute objects (for h() attrs)
// ---------------------------------------------------------------------------

/**
 * Build `aria-required` attribute for required fields.
 * Returns an object to spread into `h()` attributes, or empty object.
 */
export function ariaRequiredAttrs(
    tree: WalkedField
): Pick<HtmlAttributes, "aria-required"> | undefined {
    if (tree.isOptional === false) {
        return { "aria-required": "true" };
    }
    return undefined;
}

/**
 * Build `aria-describedby` attribute pointing to the constraint hint element.
 * Only present when constraints exist.
 */
export function ariaDescribedByAttrs(
    inputId: string,
    constraints: FieldConstraints
): Pick<HtmlAttributes, "aria-describedby"> | undefined {
    if (constraintHint(constraints) === undefined) return undefined;
    return { "aria-describedby": buildHintId(inputId) };
}

/**
 * Build `aria-readonly` attribute for read-only presentation.
 */
export function ariaReadonlyAttrs(): Pick<HtmlAttributes, "aria-readonly"> {
    return { "aria-readonly": "true" };
}

/**
 * Build `aria-label` attribute from description, if present.
 */
export function ariaLabelAttrs(
    description: unknown
): Pick<HtmlAttributes, "aria-label"> | undefined {
    if (typeof description === "string" && description.length > 0) {
        return { "aria-label": description };
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Structured hint element (for h() children)
// ---------------------------------------------------------------------------

/**
 * Build a `<small class="sc-hint">` element for constraint hints.
 * Returns undefined if no constraints are present.
 */
export function buildHintElement(
    inputId: string,
    constraints: FieldConstraints
): HtmlNode {
    const hint = constraintHint(constraints);
    if (hint === undefined) return undefined;
    return h("small", { class: "sc-hint", id: buildHintId(inputId) }, hint);
}

// ---------------------------------------------------------------------------
// Required indicator element
// ---------------------------------------------------------------------------

/**
 * Build the required-field asterisk indicator for labels.
 * Returns undefined if the field is optional.
 */
export function requiredIndicator(field: WalkedField): HtmlNode {
    if (field.isOptional === false) {
        return h("span", { class: "sc-required", "aria-hidden": "true" }, " *");
    }
    return undefined;
}
