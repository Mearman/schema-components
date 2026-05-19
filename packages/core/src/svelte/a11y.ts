/**
 * Shared ARIA attribute helpers for Svelte 5 renderers.
 *
 * Mirror of `react/a11y.ts` returning the same shapes — plain
 * `Record<string, string>` spreadable attribute bags and a
 * {@link HintInfo} descriptor for the constraint-hint `<small>`
 * element — so theme adapters compose around the same accessibility
 * primitives the headless renderer emits.
 *
 * Keep this module aligned with `react/a11y.ts` and `html/a11y.ts` —
 * all renderers must emit the same accessibility metadata for the
 * same schema field. The constraint-hint text builder
 * (`core/constraintHint.ts`) is the single source of truth for hint
 * copy; this module wires it into Svelte-flavoured attribute bags
 * and hint descriptors.
 */

import type { AllConstraints } from "../core/renderer.ts";
import type { WalkedField } from "../core/types.ts";
import { hintIdFor } from "../core/idPath.ts";
import { constraintHint as coreConstraintHint } from "../core/constraintHint.ts";

/**
 * Build the ARIA attribute bundle for a Svelte renderer.
 *
 * - `aria-required="true"` whenever the field is non-optional.
 * - `aria-describedby=<hint-id>` whenever a constraint hint applies.
 * - `aria-label=<description>` when a non-empty description is
 *   supplied via the `description` argument.
 *
 * Returns a plain `Record<string, string>` so callers can spread the
 * result into any HTML element type without per-element TypeScript
 * widening. Svelte's `{...attrs}` spread accepts the record directly.
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
 * Returned by {@link buildHintInfo} when the field carries one or
 * more constraint keywords worth announcing (min / max length,
 * pattern without format, item count, …). Theme adapters render this
 * as a `<small>` wired to the input via `aria-describedby`.
 */
export interface HintInfo {
    /** DOM id matching {@link hintIdFor}(inputId) on the host input. */
    readonly id: string;
    /** Human-readable hint text. */
    readonly hint: string;
    /** Same value as {@link id}, exposed under the React-aligned name. */
    readonly ariaDescribedBy: string;
}

/**
 * Build {@link HintInfo} for a field at `inputId` given its declared
 * constraints. Returns `undefined` when no constraint message would
 * be produced — the Svelte renderers then skip emitting the hint
 * element entirely so consumers don't see an empty `<small>`.
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

/**
 * Narrow `meta.description` (typed `unknown`) to a string value safe
 * to pass into an `aria-label` attribute. Returns `undefined` for
 * non-string or empty-string descriptions so Svelte drops the
 * attribute rather than stringifying e.g. `{}` to
 * `"[object Object]"`.
 */
export function ariaLabel(description: unknown): string | undefined {
    if (typeof description !== "string") return undefined;
    if (description.length === 0) return undefined;
    return description;
}

/**
 * True when the supplied field is non-optional and therefore
 * deserves a visual required indicator alongside its label. Exposed
 * as a predicate (rather than a built element) so theme adapters can
 * choose any presentation.
 */
export function isFieldRequired(tree: WalkedField): boolean {
    return tree.isOptional === false;
}
