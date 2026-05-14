/**
 * Shared type guards and safe property access.
 *
 * Every module in schema-components needs `isObject` and `getProperty`.
 * Defining them once eliminates the six re-implementations that existed
 * across core, react, openapi, html, and themes.
 *
 * The `object → Record<string, unknown>` conversion (`toRecord`) is
 * the one place where a cast is genuinely unavoidable — TypeScript's
 * `object` type has no index signature. See AGENTS.md: "object →
 * Record<string, unknown>".
 */

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Narrows `unknown` to a non-null, non-array object.
 * This is the most fundamental narrowing in the library — every module
 * that reads JSON Schema or OpenAPI objects uses this.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Safe property access on unknown values. Returns `undefined` if the
 * value is not an object or the key doesn't exist.
 */
export function getProperty(value: unknown, key: string): unknown {
    if (!isObject(value)) return undefined;
    return value[key];
}

/**
 * Check if a value is an object with a specific own-property.
 */
export function hasProperty(value: unknown, key: string): boolean {
    return isObject(value) && key in value;
}

// ---------------------------------------------------------------------------
// object → Record<string, unknown>
// ---------------------------------------------------------------------------

/**
 * Convert a known `object` to `Record<string, unknown>` by iterating
 * `Object.entries`. This avoids the cast that TypeScript's `object`
 * type (no index signature) otherwise forces.
 *
 * Only use this when you already know `value` is an `object` — it does
 * not perform a type guard.
 */
export function toRecord(value: object): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
        record[key] = val;
    }
    return record;
}

/**
 * Convert `unknown` to `Record<string, unknown> | undefined`.
 * Returns `undefined` for non-objects, null, and arrays.
 */
export function toRecordOrUndefined(
    value: unknown
): Record<string, unknown> | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return undefined;
    return toRecord(value);
}
