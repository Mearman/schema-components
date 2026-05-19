/**
 * Shared ARIA attribute helpers for Solid renderers.
 *
 * Mirror of `react/a11y.ts` — both adapters must emit the same
 * accessibility metadata for the same schema field. The helpers return
 * plain `Record<string, string>` bags that callers spread onto whatever
 * element type their renderer produces. Solid's JSX spread is fully
 * compatible with the same shape React's headless adapter consumes, so
 * the only divergence is the import paths.
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
 * Pass `inputId` + `constraints` only when the renderer emits a
 * constraint-hint sibling; the helper then auto-derives the
 * `aria-describedby` value from `hintIdFor(inputId)`. Omitting either
 * argument skips the attribute.
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
 * Derive the constraint-hint descriptor for a field at `inputId`.
 * Returns `undefined` when the field has no constraint worth
 * announcing — callers skip rendering the `<small>` element entirely
 * rather than emitting an empty node.
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
 */
export function isFieldRequired(tree: WalkedField): boolean {
    return tree.isOptional === false;
}

/**
 * Narrow `meta.description` (typed `unknown`) to a string value safe to
 * pass into JSX `aria-label`. Returns `undefined` for non-string or
 * empty-string descriptions so Solid drops the attribute rather than
 * stringifying e.g. `{}` to `"[object Object]"`.
 */
export function ariaLabel(description: unknown): string | undefined {
    if (typeof description !== "string") return undefined;
    if (description.length === 0) return undefined;
    return description;
}

/**
 * Structured constraint-hint data for the Solid renderers. Identical
 * shape to `react/a11y.ts` `HintInfo` — the input takes the
 * `ariaDescribedBy` id, the renderer emits a sibling `<small id={...}>`
 * whose text is `hint`. Returns `undefined` when the field has no
 * advertise-able constraints.
 */
export interface HintInfo {
    readonly id: string;
    readonly hint: string;
    readonly ariaDescribedBy: string;
}

/**
 * Build {@link HintInfo} for a field at `inputId` given its declared
 * constraints. Returns `undefined` when no constraint message would be
 * produced.
 */
export function buildHintInfo(
    inputId: string,
    constraints: AllConstraints
): HintInfo | undefined {
    const hint = coreConstraintHint(constraints);
    if (hint === undefined) return undefined;
    const id = hintIdFor(inputId);
    return { id, hint, ariaDescribedBy: id };
}
