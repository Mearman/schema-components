/**
 * Shared ARIA attribute helpers for React renderers.
 *
 * Mirror of `html/a11y.ts`'s attribute builders, but returning the
 * `Record<string, string>` shape that React headless renderers spread
 * into JSX elements. Centralising removes the ad-hoc
 * `if (props.tree.isOptional === false) ariaAttrs["aria-required"] = "true"`
 * pattern that was repeated across every editable renderer.
 *
 * Keep this module aligned with `html/a11y.ts` — both renderers must
 * emit the same accessibility metadata for the same schema field.
 */

import type { WalkedField } from "../core/types.ts";

/**
 * Build the ARIA attribute bundle for a renderer.
 *
 * - `aria-required="true"` whenever the field is non-optional.
 * - `aria-label=<description>` when a non-empty description is supplied.
 *
 * Returns a plain `Record<string, string>` (rather than a typed
 * attribute interface) so callers can spread the result into any JSX
 * element type without per-element TypeScript widening.
 *
 * Each helper from `html/a11y.ts` returns its corresponding fragment
 * separately. The React renderers merge them into a single object
 * here because the headless renderers compose one attribute bag per
 * `<input>` element rather than threading multiple bags through `h()`.
 */
export function buildAriaAttrs(
    tree: WalkedField,
    description?: unknown
): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (tree.isOptional === false) {
        attrs["aria-required"] = "true";
    }
    if (typeof description === "string" && description.length > 0) {
        attrs["aria-label"] = description;
    }
    return attrs;
}
