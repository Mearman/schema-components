/**
 * Security tests for the URI safety helpers in `core/uri.ts`.
 *
 * `isSafeHyperlink` and `isSafeMailtoAddress` decide whether attacker-
 * controlled strings are safe to interpolate into anchor `href`
 * attributes. Both must defend against payload smuggling techniques the
 * WHATWG URL parser and `mailto:` handler perform out from under the
 * naive scheme/format regex.
 */

import { describe, it, expect } from "vitest";
import { isSafeHyperlink, isSafeMailtoAddress } from "../src/core/uri.ts";

// ---------------------------------------------------------------------------
// H1 — control-character XSS bypass in isSafeHyperlink
// ---------------------------------------------------------------------------

describe("isSafeHyperlink — ASCII control-character splicing", () => {
    // The WHATWG URL parser strips tab/LF/CR before detecting the scheme,
    // so a value like `"java\tscript:alert(1)"` resolves to
    // `javascript:alert(1)` at click time even though the literal scheme
    // regex would not match. Reject any value containing those bytes
    // before the safe-scheme check ever runs.

    it("rejects tab-spliced javascript: scheme", () => {
        expect(isSafeHyperlink("java\tscript:alert(1)")).toBe(false);
    });

    it("rejects LF-spliced javascript: scheme", () => {
        expect(isSafeHyperlink("java\nscript:alert(1)")).toBe(false);
    });

    it("rejects CR-spliced javascript: scheme", () => {
        expect(isSafeHyperlink("java\rscript:alert(1)")).toBe(false);
    });

    it("rejects NUL-spliced javascript: scheme", () => {
        expect(isSafeHyperlink("java\0script:alert(1)")).toBe(false);
    });

    it("rejects leading-tab javascript: scheme", () => {
        // The WHATWG parser strips leading tabs as well, leaving a clean
        // `javascript:` for the URL state machine to consume.
        expect(isSafeHyperlink("\tjavascript:alert(1)")).toBe(false);
    });

    it("rejects leading-LF javascript: scheme", () => {
        expect(isSafeHyperlink("\njavascript:alert(1)")).toBe(false);
    });

    it("rejects leading-CR javascript: scheme", () => {
        expect(isSafeHyperlink("\rjavascript:alert(1)")).toBe(false);
    });

    it("still accepts plain http: and https: URIs", () => {
        // Regression — the new control-character refusal must not
        // accidentally reject legitimate URLs with literal spaces stripped.
        expect(isSafeHyperlink("https://example.com/")).toBe(true);
        expect(isSafeHyperlink("http://example.com/path?q=1")).toBe(true);
    });

    it("still accepts relative references", () => {
        expect(isSafeHyperlink("/relative/path")).toBe(true);
        expect(isSafeHyperlink("relative")).toBe(true);
        expect(isSafeHyperlink("")).toBe(true);
    });

    it("still rejects unprefixed javascript: scheme", () => {
        // Sanity — the original safe-scheme refusal still applies.
        expect(isSafeHyperlink("javascript:alert(1)")).toBe(false);
        expect(isSafeHyperlink("vbscript:msgbox(1)")).toBe(false);
        expect(
            isSafeHyperlink("data:text/html,<script>alert(1)</script>")
        ).toBe(false);
        expect(isSafeHyperlink("file:///etc/passwd")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// H2 — mailto: percent-encoded CRLF injection
// ---------------------------------------------------------------------------

describe("isSafeMailtoAddress — percent-encoded header injection", () => {
    // The mail client decodes percent-escapes before constructing the
    // outgoing message. An address such as `"foo%0Abcc:victim@bar.com"`
    // smuggles a `Bcc:` header (or `Subject:` / arbitrary body) into the
    // composed mail. Refusing any value containing `%` closes the
    // injection vector without touching the underlying email-format
    // regex (which other callers rely on for plain syntax validation).

    it("rejects %0A (encoded LF) inside the local part", () => {
        expect(isSafeMailtoAddress("foo%0Abcc:victim@bar.com")).toBe(false);
    });

    it("rejects %0D (encoded CR) inside the local part", () => {
        expect(isSafeMailtoAddress("foo%0Dbcc:victim@bar.com")).toBe(false);
    });

    it("rejects %00 (encoded NUL) inside the address", () => {
        expect(isSafeMailtoAddress("foo%00@bar.com")).toBe(false);
    });

    it("rejects %20 (encoded space) inside the address", () => {
        // %20 is benign in URI bodies generally, but in a `mailto:` URI it
        // breaks the address-spec parser in some clients. The bright-line
        // refusal of `%` is the simplest correct rule.
        expect(isSafeMailtoAddress("foo%20bar@bar.com")).toBe(false);
    });

    it("rejects percent-encoded bytes anywhere in the address", () => {
        expect(isSafeMailtoAddress("foo@bar.com%0Asubject:hi")).toBe(false);
        expect(isSafeMailtoAddress("foo@%2Ebar.com")).toBe(false);
    });

    it("still accepts well-formed email addresses without %", () => {
        expect(isSafeMailtoAddress("alice@example.com")).toBe(true);
        expect(isSafeMailtoAddress("alice.bob+tag@example.co.uk")).toBe(true);
    });

    it("still rejects malformed email addresses", () => {
        expect(isSafeMailtoAddress("not an email")).toBe(false);
        expect(isSafeMailtoAddress("nobody")).toBe(false);
        expect(isSafeMailtoAddress("foo@bar")).toBe(false);
    });
});
