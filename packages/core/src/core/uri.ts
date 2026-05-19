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

import { EMAIL_FORMAT_PATTERN } from "./formats.ts";

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
 * ASCII control characters that the WHATWG URL parser strips before it
 * detects a scheme. A value such as `"java\tscript:alert(1)"` therefore
 * resolves to `javascript:alert(1)` in a browser, even though the literal
 * scheme regex would not match. Splicing any of these characters into a
 * URI is unambiguously hostile, so the safe-scheme check refuses such
 * values outright.
 *
 * Source: WHATWG URL Living Standard §4.4 "URL parsing" — tab and newline
 * (`\t`, `\n`, `\r`) are removed prior to state-machine entry. NUL bytes
 * (`\0`) are likewise stripped by some user agents and never legitimate
 * inside a URI.
 *
 * https://web.archive.org/web/20251101000000*\/https://url.spec.whatwg.org/#concept-basic-url-parser
 */
const URL_CONTROL_CHARACTERS = /[\t\n\r\0]/;

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
 * `data:`, and for any value that splices ASCII tab/newline/NUL bytes
 * into its scheme — the WHATWG URL parser strips those before scheme
 * detection, so accepting them would let `"java\tscript:alert(1)"`
 * resolve to `javascript:alert(1)` in a browser.
 */
export function isSafeHyperlink(value: string): boolean {
    // Reject values containing ASCII control characters the URL parser
    // strips before scheme detection. A literal scheme regex would not
    // match `"java\tscript:"`, but a browser would still resolve it to
    // `javascript:` — refuse the value outright.
    if (URL_CONTROL_CHARACTERS.test(value)) return false;
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
 * pattern. The format pattern excludes whitespace, but it does permit
 * `%`, and a browser decodes percent-escapes at click time — so a value
 * such as `"foo%0Abcc:victim@bar.com"` would inject a `Bcc:` header into
 * the resulting `mailto:` URI. Refuse any value containing `%` to close
 * that header-injection vector. The plain email-format regex stays a
 * pure email-syntax check; the additional `%` filter lives here so other
 * callers of the format pattern (form validators, JSON Schema `format:
 * email` checks) are not affected.
 */
export function isSafeMailtoAddress(value: string): boolean {
    // A literal `%` in an email address cannot have a legitimate
    // interpretation inside a `mailto:` URI — the browser will decode
    // any percent-escape before passing the result to the mail client,
    // turning `%0A` / `%0D` into CRLF and splicing additional headers.
    if (value.includes("%")) return false;
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
