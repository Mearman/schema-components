/**
 * Shared ARIA helpers for HTML renderers.
 *
 * These return structured data (attribute objects, child nodes) that work
 * with the typed `h()` builder in `html.ts`. No string templates here.
 *
 * Used by both the synchronous renderer (renderToHtml) and the streaming
 * renderer (renderToHtmlStream) to produce consistent accessibility markup.
 */

import type { WalkedField } from "../core/types.ts";
import type { AllConstraints } from "../core/renderer.ts";
import { fieldDomId, hintIdFor } from "../core/idPath.ts";
import { constraintHint } from "../core/constraintHint.ts";
import { h, type HtmlAttributes, type HtmlNode } from "./html.ts";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Append a structural suffix to a parent path. Mirrors the canonical
 * `joinPath` used by the React renderers: when the suffix is omitted
 * (e.g. transparent wrappers like union options) the parent path is
 * returned unchanged so the child inherits the parent's id.
 *
 * Suffixes are dot-joined except for bracketed array indices like `[0]`
 * which append directly so `tags` + `[0]` becomes `tags[0]` rather than
 * `tags.[0]`.
 */
export function joinPath(parent: string, suffix: string | undefined): string {
    if (suffix === undefined || suffix.length === 0) return parent;
    if (parent.length === 0) return suffix;
    if (suffix.startsWith("[")) return `${parent}${suffix}`;
    return `${parent}.${suffix}`;
}

// ---------------------------------------------------------------------------
// Input ID helpers
// ---------------------------------------------------------------------------

/**
 * Build the input ID for a field at a given path. Joins `path` and `key`
 * via `joinPath` then delegates to the canonical `fieldDomId` helper from
 * `core/idPath.ts` so every render pipeline emits identical ids for the
 * same structural position.
 */
export function buildInputId(path: string, key: string): string {
    return fieldDomId(joinPath(path, key));
}

/**
 * Derive the hint element ID from the input ID. Thin re-export of the
 * canonical helper so this module remains the one-stop a11y surface for
 * the HTML renderers.
 */
export function buildHintId(inputId: string): string {
    return hintIdFor(inputId);
}

// ---------------------------------------------------------------------------
// Constraint descriptions
// ---------------------------------------------------------------------------

/**
 * Public re-export of the canonical {@link constraintHint} text builder
 * implemented in `core/constraintHint.ts`. Consumers can keep importing
 * from `schema-components/html/a11y` — the implementation lives in
 * `core/` so both the React and HTML pipelines share one text source.
 */
export { constraintHint };

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
    constraints: AllConstraints
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
    constraints: AllConstraints
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
