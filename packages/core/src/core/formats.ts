/**
 * Built-in format patterns for JSON Schema string validation.
 *
 * Maps standard JSON Schema/OpenAPI `format` values to RegExp patterns.
 * Used by the constraint extractor to derive `formatPattern` alongside
 * the existing `format` string, and by the `validate` helper for
 * runtime format checking.
 *
 * The user's explicit `pattern` constraint always takes precedence —
 * `formatPattern` is exposed as a separate field for renderers.
 */

// ---------------------------------------------------------------------------
// Pattern registry
// ---------------------------------------------------------------------------

/**
 * Recognised JSON Schema formats with their validation patterns.
 * Unknown formats emit an `unknown-format` diagnostic and skip derivation.
 */
export const FORMAT_PATTERNS: Readonly<Record<string, RegExp>> = {
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    "date-time":
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
    time: /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
    ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
    ipv6: /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i,
    uri: /^[a-z][a-z0-9+\-.]*:/i,
    hostname:
        /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i,
};

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validate a string value against format constraints.
 * Returns `true` when the value matches the format pattern,
 * `false` when it does not, and `undefined` when the format
 * is not recognised (no pattern available).
 */
export function validateFormat(
    value: string,
    format: string
): boolean | undefined {
    const pattern = FORMAT_PATTERNS[format];
    if (pattern === undefined) return undefined;
    return pattern.test(value);
}
