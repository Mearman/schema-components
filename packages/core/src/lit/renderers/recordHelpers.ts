/**
 * Pure helpers shared by `<sc-array>` and `<sc-record>`.
 *
 * Mirror the helpers exported from `react/headlessRenderers.tsx`
 * (`defaultRecordValue`, `nextRecordKey`, `renameRecordKey`). The
 * implementations are framework-agnostic and could live in `core/`,
 * but the original copies still live under `react/` so the Lit
 * adapter re-implements them locally rather than triggering the
 * `react → lit` import path that the layer-boundary lint rule would
 * (correctly) reject.
 *
 * @packageDocumentation
 */

import type { WalkedField } from "../../core/types.ts";

/**
 * Compute the default value for a freshly added array element or
 * record entry based on its element / value schema. Mirrors
 * `react/headlessRenderers.tsx::defaultRecordValue` so the same
 * field type produces the same default across renderers.
 */
export function defaultRecordValueLit(valueType: WalkedField): unknown {
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
 * `existing`. Mirrors `react/headlessRenderers.tsx::nextRecordKey`.
 */
export function nextRecordKeyLit(
    existing: readonly string[],
    base = "key"
): string {
    if (!existing.includes(base)) return base;
    let i = 1;
    while (existing.includes(`${base}-${String(i)}`)) i += 1;
    return `${base}-${String(i)}`;
}

/**
 * Rename a key in an object while preserving insertion order. Returns
 * the original reference when the rename is a no-op (same key) or
 * when the new key collides with an existing entry. Mirrors
 * `react/headlessRenderers.tsx::renameRecordKey`.
 */
export function renameRecordKeyLit(
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
