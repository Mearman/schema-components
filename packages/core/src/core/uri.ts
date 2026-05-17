/**
 * URI safety helpers shared by HTML and React renderers.
 *
 * User-supplied URI values flow into anchor `href` attributes. Without
 * scheme validation a value such as `javascript:alert(1)` becomes a
 * clickable XSS sink — HTML escaping does not help, since the dangerous
 * payload sits inside the scheme rather than the body of the attribute.
 *
 * These helpers exist so the HTML renderer (`html/renderers.ts`) and the
 * React renderer (`react/headlessRenderers.tsx`) apply identical rules
 * when deciding whether a string is safe to render as an `href`.
 */

import { FORMAT_PATTERNS } from "./formats.ts";

/**
 * The standard JSON Schema `email` format pattern. Captured once at
 * module load so the mailto safety check does not pay the lookup cost
 * on every call, and so a missing entry surfaces immediately as a
 * load-time error rather than a silent acceptance of unsafe values at
 * render time.
 */
const EMAIL_FORMAT_PATTERN: RegExp = (() => {
    const pattern = FORMAT_PATTERNS.email;
    if (pattern === undefined) {
        throw new Error(
            "FORMAT_PATTERNS.email is missing — mailto safety check cannot operate without it."
        );
    }
    return pattern;
})();

// ---------------------------------------------------------------------------
// Hyperlink scheme allow-list
// ---------------------------------------------------------------------------

/**
 * Match the scheme portion of an absolute URI (RFC 3986 production
 * `scheme ":"`). Leading ASCII whitespace is tolerated because browsers
 * strip it before parsing the scheme; any other prefix (including raw
 * control characters) keeps the value out of the safe-scheme branch.
 */
const ABSOLUTE_URI_SCHEME = /^\s*([a-z][a-z0-9+\-.]*):/i;

/**
 * Schemes safe to emit unmodified into an `href` attribute. Anything
 * outside this set — most importantly `javascript:`, `data:`, `vbscript:`
 * and `file:` — is rejected and rendered as text.
 */
const SAFE_HYPERLINK_SCHEMES: ReadonlySet<string> = new Set(["http", "https"]);

/**
 * Decide whether `value` is safe to use as an anchor `href`.
 *
 * Returns `true` when the value is either a relative reference (no scheme
 * component) or an absolute URI using `http`/`https`. Returns `false`
 * for any other scheme, including dangerous ones like `javascript:` and
 * `data:`.
 */
export function isSafeHyperlink(value: string): boolean {
    const match = ABSOLUTE_URI_SCHEME.exec(value);
    if (match === null) {
        // No scheme means a relative reference — safe to emit as-is.
        return true;
    }
    const scheme = match[1];
    if (scheme === undefined) return false;
    return SAFE_HYPERLINK_SCHEMES.has(scheme.toLowerCase());
}

// ---------------------------------------------------------------------------
// mailto: address validation
// ---------------------------------------------------------------------------

/**
 * Decide whether `value` is safe to interpolate into a `mailto:` URI.
 *
 * The check rejects values that do not match the standard email format
 * pattern. The format pattern excludes whitespace, which means a CRLF
 * sequence (or its percent-encoded form embedded by the caller) cannot
 * pass — eliminating the SMTP/`mailto` header-injection vector.
 */
export function isSafeMailtoAddress(value: string): boolean {
    return EMAIL_FORMAT_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Prototype-polluting property names
// ---------------------------------------------------------------------------

/**
 * Property names that must never be traversed via dynamic indexing on an
 * untrusted object. Walking into any of these returns `Object.prototype`
 * (or similar) and lets an attacker plant fields visible to every plain
 * object in the runtime.
 */
const PROTOTYPE_POLLUTING_KEYS: ReadonlySet<string> = new Set([
    "__proto__",
    "constructor",
    "prototype",
]);

/**
 * Decide whether `key` is one of the prototype-polluting property names
 * (`__proto__`, `constructor`, `prototype`).
 *
 * Used by JSON Pointer resolvers and by the JSON Schema `properties`
 * walker to refuse traversal into these names.
 */
export function isPrototypePollutingKey(key: string): boolean {
    return PROTOTYPE_POLLUTING_KEYS.has(key);
}
