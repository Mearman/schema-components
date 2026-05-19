/**
 * Shared ARIA attribute helpers for React renderers.
 *
 * Mirror of `html/a11y.ts`'s attribute builders, returning JSX-friendly
 * shapes — plain `Record<string, string>` for spreadable attribute bags
 * and a `Hint` descriptor for the constraint-hint `<small>` element so
 * theme adapters can compose around the same accessibility primitives
 * the headless renderer emits.
 *
 * Keep this module aligned with `html/a11y.ts` — both renderers must
 * emit the same accessibility metadata for the same schema field. The
 * HTML helpers produce typed `HtmlAttributes` partial objects; these
 * return identical content reshaped for JSX consumption.
 */

import type { AllConstraints } from "../core/renderer.ts";
import type { WalkedField } from "../core/types.ts";
import { hintIdFor } from "../core/idPath.ts";
import { constraintHint as coreConstraintHint } from "../core/constraintHint.ts";

/**
 * Build the ARIA attribute bundle for a renderer.
 *
 * - `aria-required="true"` whenever the field is non-optional.
 * - `aria-describedby=<hint-id>` whenever a constraint hint applies.
 * - `aria-label=<description>` when a non-empty description is supplied.
 *
 * Returns a plain `Record<string, string>` (rather than a typed
 * attribute interface) so callers can spread the result into any JSX
 * element type without per-element TypeScript widening.
 *
 * `inputId` and `constraints` together control whether
 * `aria-describedby` is emitted. Pass `undefined` for `constraints`
 * when the renderer never emits a constraint hint (e.g. boolean
 * checkboxes); the helper then skips the attribute entirely. When the
 * caller does emit a hint via `buildHint(...)`, the `aria-describedby`
 * id matches `hintIdFor(inputId)` so the wire-up holds end-to-end.
 */
export function buildAriaAttrs(
    tree: WalkedField,
    description?: unknown,
    inputId?: string,
    constraints?: AllConstraints
): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (tree.isOptional === false) {
        attrs["aria-required"] = "true";
    }
    if (
        inputId !== undefined &&
        constraints !== undefined &&
        coreConstraintHint(constraints) !== undefined
    ) {
        attrs["aria-describedby"] = hintIdFor(inputId);
    }
    if (typeof description === "string" && description.length > 0) {
        attrs["aria-label"] = description;
    }
    return attrs;
}

/**
 * Description for a constraint hint emitted alongside an input.
 *
 * Returned by {@link constraintHint} when the field carries one or
 * more constraint keywords the user should be told about (min/max,
 * pattern, item count, …). Theme adapters render this as a `<small>`
 * element wired to the input via `aria-describedby`.
 */
export interface Hint {
    /** DOM id matching {@link hintIdFor}(inputId) on the host input. */
    readonly id: string;
    /** Human-readable hint text. */
    readonly text: string;
}

/**
 * Derive the constraint-hint descriptor for a field at `inputId`. Returns
 * `undefined` when the field has no constraint worth announcing — callers
 * skip rendering the `<small>` element entirely rather than emitting an
 * empty node.
 *
 * Shares its text builder with `html/a11y.ts` so the two renderers
 * always announce the same constraint copy for the same schema field.
 */
export function constraintHint(
    inputId: string,
    constraints: AllConstraints
): Hint | undefined {
    const text = coreConstraintHint(constraints);
    if (text === undefined) return undefined;
    return { id: hintIdFor(inputId), text };
}

/**
 * True when the supplied field is non-optional and therefore deserves
 * a visual required indicator alongside its label.
 *
 * Exposed as a predicate rather than a JSX element so theme adapters
 * can render the indicator in whatever element type matches their
 * design language (`<span>`, `<sup>`, an icon component, …).
 */
export function isFieldRequired(tree: WalkedField): boolean {
    return tree.isOptional === false;
}

/**
 * Narrow `meta.description` (typed `unknown`) to a string value safe to
 * pass into JSX `aria-label`. Returns `undefined` for non-string or
 * empty-string descriptions so React drops the attribute rather than
 * stringifying e.g. `{}` to `"[object Object]"`.
 */
export function ariaLabel(description: unknown): string | undefined {
    if (typeof description !== "string") return undefined;
    if (description.length === 0) return undefined;
    return description;
}
