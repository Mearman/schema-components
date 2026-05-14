/**
 * Shared test helpers with type-safe narrowing.
 *
 * These functions throw with a descriptive message when a value is
 * undefined, and return the narrowed type for TypeScript.
 */
import type { WalkedField } from "../src/core/types.ts";

/**
 * Assert a value is defined (not undefined). Returns narrowed type.
 */
export function assertDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined) {
        throw new Error(message);
    }
    return value;
}

/**
 * Walk a WalkedField tree by key path, throwing if any intermediate
 * field is missing. Replaces the old getField helper.
 */
export function getField(tree: WalkedField, ...keys: string[]): WalkedField {
    let current: WalkedField = tree;
    for (const key of keys) {
        const fields = assertDefined(
            current.fields,
            `Expected fields at ${keys.join(".")}`
        );
        const child = assertDefined(
            fields[key],
            `Expected field "${key}" at ${keys.join(".")}`
        );
        current = child;
    }
    return current;
}
