/**
 * Human-readable constraint-hint copy shared by every renderer surface.
 *
 * The React, HTML synchronous, and HTML streaming pipelines all advertise
 * the same field constraints to assistive technology via a `<small>` hint
 * element wired up through `aria-describedby`. Centralising the text
 * builder here keeps the copy identical across pipelines — a divergence
 * is a usability bug (screen-reader users hear different copy depending
 * on which renderer the host application chose) so the rule is enforced
 * structurally by importing from this single module.
 *
 * Lives in `core/` because constraints themselves are a `core/` concept
 * and the helpers below contain no rendering logic — they format text
 * given a constraint bag.
 */

import type { AllConstraints } from "./renderer.ts";

/**
 * Build a human-readable constraint description string.
 *
 * Returns `undefined` when no constraint worth announcing is present.
 * Pattern hints are suppressed when a `format` is set because the
 * format already implies the pattern and the resulting copy would be
 * misleading ("Must match pattern" alongside a `format: "email"` field
 * would read as if the schema required a non-email regex).
 */
export function constraintHint(c: AllConstraints): string | undefined {
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
