/**
 * Field ordering helper for object containers.
 *
 * Object properties accept `.meta({ order: N })` (lower numbers render
 * first). Every renderer that walks an object's fields must apply the
 * same sort so order is consistent across the headless renderer, HTML
 * renderer, and every theme adapter.
 *
 * Fields without an explicit `order` sort last, retaining their
 * relative insertion order — JavaScript's `Array.prototype.sort` is
 * stable, so ties preserve the original sequence.
 */

import type { WalkedField } from "./types.ts";

/**
 * Sort `Object.entries(fields)` by `meta.order`. Lower values come
 * first; fields without `meta.order` fall back to `Infinity` (last).
 */
export function sortFieldsByOrder(
    fields: Record<string, WalkedField>
): [string, WalkedField][] {
    return Object.entries(fields).sort((a, b) => {
        const orderA =
            typeof a[1].meta.order === "number" ? a[1].meta.order : Infinity;
        const orderB =
            typeof b[1].meta.order === "number" ? b[1].meta.order : Infinity;
        return orderA - orderB;
    });
}
