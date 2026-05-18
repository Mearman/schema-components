/**
 * Shared union-option matching and discriminator-resolution helpers.
 *
 * These transformations are render-pipeline agnostic — the React, HTML-sync,
 * and HTML-stream renderers all pick a union option the same way and derive
 * the same discriminator labels. Centralising removes three-way drift risk.
 */

import type { WalkedField } from "./types.ts";

/**
 * Pick the union option that structurally matches the supplied value.
 *
 * Heuristic only — picks by JavaScript typeof / array / object class. Returns
 * `undefined` when the value's shape doesn't correspond to any option (for
 * example a `null` value against a non-nullable union). Callers should
 * fall back to the first option or render an empty state in that case.
 */
export function matchUnionOption(
    options: readonly WalkedField[],
    value: unknown
): WalkedField | undefined {
    if (typeof value === "string") {
        return options.find((o) => o.type === "string" || o.type === "enum");
    }
    if (typeof value === "number") {
        return options.find((o) => o.type === "number");
    }
    if (typeof value === "boolean") {
        return options.find((o) => o.type === "boolean");
    }
    if (Array.isArray(value)) {
        return options.find((o) => o.type === "array");
    }
    if (typeof value === "object" && value !== null) {
        return options.find((o) => o.type === "object");
    }
    return undefined;
}

/**
 * Resolution of a discriminated union against a concrete value. The renderer
 * uses `optionLabels` to title each tab, `activeIndex` to select the open
 * tab, and `activeOption` as the field to render below.
 */
export interface DiscriminatedActive {
    readonly optionLabels: readonly string[];
    readonly activeIndex: number;
    readonly activeOption: WalkedField | undefined;
}

/**
 * Derive labels, active index, and active option for a discriminated union.
 *
 * For each option, the label is the discriminator property's `const` value
 * (when the option is an object with a literal discriminator) or, failing
 * that, the option's `meta.title` or its `type`. The active index is chosen
 * from the discriminator's value on `valueObject`; missing or non-matching
 * values fall back to index 0.
 *
 * Pure data transformation — no rendering concerns, no React imports.
 */
export function resolveDiscriminatedActive(
    options: readonly WalkedField[],
    discriminator: string,
    valueObject: Record<string, unknown> | undefined
): DiscriminatedActive {
    const currentDiscriminatorValue: string | undefined =
        valueObject !== undefined &&
        typeof valueObject[discriminator] === "string"
            ? valueObject[discriminator]
            : undefined;

    const optionLabels = options.map((opt): string => {
        if (opt.type === "object") {
            const discriminatorField = opt.fields[discriminator];
            if (discriminatorField?.type === "literal") {
                const constVal = discriminatorField.literalValues[0];
                if (typeof constVal === "string") return constVal;
            }
        }
        if (typeof opt.meta.title === "string") return opt.meta.title;
        return opt.type;
    });

    let activeIndex = 0;
    if (currentDiscriminatorValue !== undefined) {
        const found = optionLabels.indexOf(currentDiscriminatorValue);
        if (found !== -1) activeIndex = found;
    }

    return {
        optionLabels,
        activeIndex,
        activeOption: options[activeIndex],
    };
}
