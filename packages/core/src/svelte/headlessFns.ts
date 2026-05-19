/**
 * Pure helper functions shared by the Svelte 5 headless renderers.
 *
 * Ports the framework-agnostic helpers attached to
 * `react/headlessRenderers.tsx`:
 *
 *   - {@link defaultRecordValue} — type-appropriate "new entry" value
 *     for `RecordField` / `ArrayField`'s Add button.
 *   - {@link nextRecordKey} — collision-free key generator for the
 *     Record "Add entry" button.
 *   - {@link renameRecordKey} — insertion-order-preserving rename.
 *   - {@link discriminatedUnionValueForTab} — tab-index → emitted
 *     value mapper for the discriminated-union tabs widget.
 *
 * These contain no rendering logic — they are pure functions over
 * the walked field tree and JS values, so the React and Svelte
 * adapters share the same behaviour without depending on each
 * other's rendering surface.
 */

import type { WalkedField } from "../core/types.ts";

/**
 * Compute the default value for a freshly added record / array
 * entry based on the value-type schema. Falls back to a
 * type-appropriate empty value when the schema does not declare a
 * default.
 *
 * The switch is exhaustive over `WalkedField.type` so a new schema
 * variant added to the walker forces a deliberate choice of default
 * here rather than silently producing `undefined`.
 */
export function defaultRecordValue(valueType: WalkedField): unknown {
    if (valueType.defaultValue !== undefined) return valueType.defaultValue;
    switch (valueType.type) {
        case "string":
            return "";
        case "number":
            return 0;
        case "boolean":
            return false;
        case "array":
            return [];
        case "object":
        case "record":
            return {};
        case "null":
            return null;
        case "unknown":
        case "enum":
        case "literal":
        case "tuple":
        case "union":
        case "discriminatedUnion":
        case "conditional":
        case "negation":
        case "file":
        case "never":
            return undefined;
    }
}

/**
 * Generate a unique, currently-unused key for a new record entry.
 * Picks the first of `key`, `key-1`, `key-2`, … that is not in
 * `existing`.
 */
export function nextRecordKey(
    existing: readonly string[],
    base = "key"
): string {
    if (!existing.includes(base)) return base;
    let i = 1;
    while (existing.includes(`${base}-${String(i)}`)) i += 1;
    return `${base}-${String(i)}`;
}

/**
 * Rename a key in an object while preserving insertion order.
 * Returns the original object reference when the rename is a no-op
 * (`oldKey === newKey`) or when `newKey` collides with an existing
 * key — the renderer uses reference equality to skip an unnecessary
 * `props.onChange` call.
 */
export function renameRecordKey(
    obj: Record<string, unknown>,
    oldKey: string,
    newKey: string
): Record<string, unknown> {
    if (oldKey === newKey) return obj;
    if (newKey in obj && newKey !== oldKey) return obj;
    const renamed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        renamed[k === oldKey ? newKey : k] = v;
    }
    return renamed;
}

/**
 * Pure helper: convert a tab index into the new value the
 * discriminated union should emit. Returns `undefined` when the index
 * is out of bounds — callers skip the `onChange` call entirely.
 *
 * Extracted so the contract is unit-testable without rendering the
 * tabs component.
 */
export function discriminatedUnionValueForTab(
    optionLabels: readonly string[],
    discKey: string,
    newIndex: number
): Record<string, string> | undefined {
    const label = optionLabels[newIndex];
    if (label === undefined) return undefined;
    return { [discKey]: label };
}

/**
 * Wrap an index into a valid tab index using floored modulo. Used
 * by the discriminated-union keyboard handler to wrap arrow-key
 * navigation at the extremes.
 */
export function wrapTabIndex(index: number, total: number): number {
    return ((index % total) + total) % total;
}
