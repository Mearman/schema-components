/**
 * Built-in format patterns for JSON Schema string validation.
 *
 * Maps standard JSON Schema/OpenAPI `format` values to RegExp patterns
 * or predicate validators. Used by the constraint extractor to derive
 * `formatPattern` alongside the existing `format` string, and by the
 * `validate` helper for runtime format checking.
 *
 * Formats that cannot be validated by regex (iri, regex) use predicate
 * functions instead. `validateFormat` dispatches to whichever is available.
 *
 * The user's explicit `pattern` constraint always takes precedence —
 * `formatPattern` is exposed as a separate field for renderers.
 */

// ---------------------------------------------------------------------------
// Validator type
// ---------------------------------------------------------------------------

/**
 * A format validator: either a RegExp pattern or a predicate function.
 */
export type FormatValidator = RegExp | ((value: string) => boolean);

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
    "uri-reference": /^(|[a-z][a-z0-9+\-.]*:|[?#][^\s]*)/i,
    // uri-template RFC 6570: literal chars or {varspec} expressions
    // Using [/] instead of \/ inside character classes to avoid no-useless-escape
    "uri-template":
        /^([^{}]|[{][+#/.;?&=,!@|]([a-zA-Z0-9_%.]+)?(:[1-9][0-9]*)?(,[a-zA-Z0-9_%.]+)*[}])*$/,
    // json-pointer RFC 6901: "" or /token/token... where token escapes ~0 ~1
    "json-pointer": /^(([/]([^/~]|~0|~1)*)*|)$/,
    // relative-json-pointer: integer followed by optional # or json-pointer
    "relative-json-pointer": /^(0|[1-9][0-9]*)(#?([/]([^/~]|~0|~1)*)*)?$/,
    duration:
        /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/,
    "idn-email": /^[^\s@]+@[^\s@]+\.[^\s@]+$/u,
    "idn-hostname":
        /^[a-z0-9\u00a1-\uffff]([a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?(\.[a-z0-9\u00a1-\uffff]([a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?)*$/iu,
    // --- Zod 4 emitted formats ---
    // Patterns copied verbatim from Zod 4's canonical regex registry to stay
    // in lockstep with the values z.toJSONSchema() emits.
    // Source: node_modules/zod/src/v4/core/regexes.ts
    // https://github.com/colinhacks/zod/blob/v4/src/v4/core/regexes.ts
    cuid: /^[cC][0-9a-z]{6,}$/,
    cuid2: /^[0-9a-z]+$/,
    nanoid: /^[a-zA-Z0-9_-]{21}$/,
    cidrv4: /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/,
    cidrv6: /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
    base64: /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/,
    base64url: /^[A-Za-z0-9_-]*$/,
    // E.164: leading "+", country digit 1-9, 6-14 more digits (total 7-15)
    e164: /^\+[1-9]\d{6,14}$/,
};

// ---------------------------------------------------------------------------
// Predicate validators (cannot be expressed as regex)
// ---------------------------------------------------------------------------

/**
 * Format validators that use predicate functions instead of regex.
 * These are checked in `validateFormat` when no regex pattern exists.
 */
const PREDICATE_VALIDATORS: Readonly<
    Record<string, (value: string) => boolean>
> = {
    iri: (value: string): boolean => {
        try {
            const url = new URL(value);
            return url.protocol.length > 0;
        } catch {
            return false;
        }
    },
    "iri-reference": (value: string): boolean => {
        // IRI-reference allows relative refs, empty string
        if (value === "") return true;
        try {
            new URL(value);
            return true;
        } catch {
            // Could be a relative reference — accept if no whitespace
            return !/\s/.test(value);
        }
    },
    regex: (value: string): boolean => {
        try {
            new RegExp(value);
            return true;
        } catch {
            return false;
        }
    },
};

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validate a string value against format constraints.
 * Returns `true` when the value matches the format,
 * `false` when it does not, and `undefined` when the format
 * is not recognised (no validator available).
 */
export function validateFormat(
    value: string,
    format: string
): boolean | undefined {
    const pattern = FORMAT_PATTERNS[format];
    if (pattern !== undefined) return pattern.test(value);

    const predicate = PREDICATE_VALIDATORS[format];
    if (predicate !== undefined) return predicate(value);

    return undefined;
}
