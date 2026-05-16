/**
 * Unit tests for format validation patterns.
 *
 * Verifies that each built-in format pattern accepts canonical examples
 * and rejects obvious negatives. Also tests that unknown formats
 * are handled gracefully.
 */

import { describe, it, expect } from "vitest";
import { FORMAT_PATTERNS, validateFormat } from "../src/core/formats.ts";
import { walk } from "../src/core/walker.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

// ---------------------------------------------------------------------------
// Helper — safe access to FORMAT_PATTERNS entries
// ---------------------------------------------------------------------------

/**
 * Get a format pattern by name, throwing if the format is not registered.
 * This avoids non-null assertions while keeping tests concise.
 */
function patternFor(format: string): RegExp {
    const p = FORMAT_PATTERNS[format];
    if (p === undefined) {
        throw new Error(`No pattern registered for format "${format}"`);
    }
    return p;
}

// ---------------------------------------------------------------------------
// FORMAT_PATTERNS — canonical positives
// ---------------------------------------------------------------------------

describe("FORMAT_PATTERNS", () => {
    it("uuid accepts canonical UUIDs", () => {
        const uuid = patternFor("uuid");
        expect(uuid.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
        expect(uuid.test("00000000-0000-0000-0000-000000000000")).toBe(true);
    });

    it("uuid rejects non-UUIDs", () => {
        const uuid = patternFor("uuid");
        expect(uuid.test("not-a-uuid")).toBe(false);
        expect(uuid.test("550e8400-e29b-41d4-a716")).toBe(false);
    });

    it("email accepts valid emails", () => {
        const email = patternFor("email");
        expect(email.test("user@example.com")).toBe(true);
        expect(email.test("a@b.co")).toBe(true);
    });

    it("email rejects invalid emails", () => {
        const email = patternFor("email");
        expect(email.test("not-an-email")).toBe(false);
        expect(email.test("@example.com")).toBe(false);
        expect(email.test("user@")).toBe(false);
    });

    it("date-time accepts ISO 8601 datetime", () => {
        const dt = patternFor("date-time");
        expect(dt.test("2024-01-15T10:30:00Z")).toBe(true);
        expect(dt.test("2024-01-15T10:30:00+05:30")).toBe(true);
        expect(dt.test("2024-01-15T10:30:00.123Z")).toBe(true);
    });

    it("date-time rejects invalid datetimes", () => {
        const dt = patternFor("date-time");
        expect(dt.test("2024-01-15")).toBe(false);
        expect(dt.test("not-a-date")).toBe(false);
    });

    it("date accepts YYYY-MM-DD", () => {
        expect(patternFor("date").test("2024-01-15")).toBe(true);
    });

    it("date rejects non-dates", () => {
        const date = patternFor("date");
        expect(date.test("2024/01/15")).toBe(false);
        expect(date.test("not-a-date")).toBe(false);
    });

    it("time accepts HH:MM:SS", () => {
        const time = patternFor("time");
        expect(time.test("10:30:00")).toBe(true);
        expect(time.test("10:30:00Z")).toBe(true);
        expect(time.test("10:30:00.123+05:30")).toBe(true);
    });

    it("time rejects invalid times", () => {
        expect(patternFor("time").test("not-a-time")).toBe(false);
    });

    it("ipv4 accepts valid IPv4 addresses", () => {
        const ipv4 = patternFor("ipv4");
        expect(ipv4.test("192.168.1.1")).toBe(true);
        expect(ipv4.test("0.0.0.0")).toBe(true);
    });

    it("ipv4 rejects invalid IPv4", () => {
        const ipv4 = patternFor("ipv4");
        expect(ipv4.test("not-an-ip")).toBe(false);
        expect(ipv4.test("1.2.3")).toBe(false);
    });

    it("ipv6 accepts valid IPv6 addresses", () => {
        expect(patternFor("ipv6").test("::1")).toBe(true);
        expect(
            patternFor("ipv6").test("2001:0db8:85a3:0000:0000:8a2e:0370:7334")
        ).toBe(true);
    });

    it("uri accepts valid URIs", () => {
        const uri = patternFor("uri");
        expect(uri.test("https://example.com")).toBe(true);
        expect(uri.test("ftp://files.example.com")).toBe(true);
    });

    it("uri rejects invalid URIs", () => {
        expect(patternFor("uri").test("not a uri")).toBe(false);
    });

    it("hostname accepts valid hostnames", () => {
        const hostname = patternFor("hostname");
        expect(hostname.test("example.com")).toBe(true);
        expect(hostname.test("sub.domain.example.com")).toBe(true);
    });

    // --- New format patterns ---

    it("uri-reference accepts absolute URIs", () => {
        const ref = patternFor("uri-reference");
        expect(ref.test("https://example.com/path")).toBe(true);
    });

    it("uri-reference accepts relative refs", () => {
        const ref = patternFor("uri-reference");
        expect(ref.test("/path/to/resource")).toBe(true);
        expect(ref.test("")).toBe(true);
        expect(ref.test("?query=value")).toBe(true);
        expect(ref.test("#fragment")).toBe(true);
    });

    it("json-pointer accepts valid pointers", () => {
        const jp = patternFor("json-pointer");
        expect(jp.test("")).toBe(true);
        expect(jp.test("/foo")).toBe(true);
        expect(jp.test("/foo/bar")).toBe(true);
        expect(jp.test("/foo~0bar")).toBe(true);
        expect(jp.test("/foo~1bar")).toBe(true);
    });

    it("json-pointer rejects invalid pointers", () => {
        expect(patternFor("json-pointer").test("foo")).toBe(false);
    });

    it("relative-json-pointer accepts valid pointers", () => {
        const rjp = patternFor("relative-json-pointer");
        expect(rjp.test("0")).toBe(true);
        expect(rjp.test("1/foo")).toBe(true);
        expect(rjp.test("3#/definitions/X")).toBe(true);
    });

    it("relative-json-pointer rejects invalid pointers", () => {
        expect(patternFor("relative-json-pointer").test("01")).toBe(false);
        expect(patternFor("relative-json-pointer").test("-1")).toBe(false);
    });

    it("duration accepts valid ISO 8601 durations", () => {
        const dur = patternFor("duration");
        expect(dur.test("P1Y2M3DT4H5M6S")).toBe(true);
        expect(dur.test("PT1H")).toBe(true);
        expect(dur.test("P1W")).toBe(true);
        expect(dur.test("P0D")).toBe(true);
    });

    it("duration rejects invalid durations", () => {
        expect(patternFor("duration").test("P")).toBe(false);
        expect(patternFor("duration").test("1H")).toBe(false);
    });

    it("idn-email accepts Unicode emails", () => {
        const idn = patternFor("idn-email");
        expect(idn.test("user@例え.jp")).toBe(true);
        expect(idn.test("user@example.com")).toBe(true);
    });

    it("idn-hostname accepts Unicode hostnames", () => {
        const idn = patternFor("idn-hostname");
        expect(idn.test("例え.jp")).toBe(true);
        expect(idn.test("example.com")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Predicate validators (iri, iri-reference, regex)
// ---------------------------------------------------------------------------

describe("predicate validators", () => {
    it("iri accepts valid IRIs", () => {
        expect(validateFormat("https://例え.jp/path", "iri")).toBe(true);
        expect(validateFormat("http://example.com", "iri")).toBe(true);
    });

    it("iri rejects invalid IRIs", () => {
        expect(validateFormat("not an iri", "iri")).toBe(false);
    });

    it("iri-reference accepts valid IRI references", () => {
        expect(validateFormat("https://example.com", "iri-reference")).toBe(
            true
        );
        expect(validateFormat("", "iri-reference")).toBe(true);
        expect(validateFormat("/path", "iri-reference")).toBe(true);
    });

    it("regex accepts valid regex patterns", () => {
        expect(validateFormat("^[a-z]+$", "regex")).toBe(true);
        expect(validateFormat(".*", "regex")).toBe(true);
    });

    it("regex rejects invalid regex patterns", () => {
        expect(validateFormat("[invalid", "regex")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateFormat
// ---------------------------------------------------------------------------

describe("validateFormat", () => {
    it("returns true for matching values", () => {
        expect(validateFormat("user@example.com", "email")).toBe(true);
        expect(
            validateFormat("550e8400-e29b-41d4-a716-446655440000", "uuid")
        ).toBe(true);
        expect(validateFormat("2024-01-15", "date")).toBe(true);
    });

    it("returns false for non-matching values", () => {
        expect(validateFormat("not-an-email", "email")).toBe(false);
        expect(validateFormat("not-a-uuid", "uuid")).toBe(false);
    });

    it("returns undefined for unknown formats", () => {
        expect(validateFormat("anything", "custom-format")).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// Walker integration — formatPattern in constraints
// ---------------------------------------------------------------------------

describe("walker formatPattern integration", () => {
    it("derives formatPattern for known formats", () => {
        const tree = walk({ type: "string", format: "email" });
        if (tree.type !== "string") {
            expect.unreachable("Expected string field");
            return;
        }
        expect(tree.constraints.format).toBe("email");
        expect(tree.constraints.formatPattern).toBeInstanceOf(RegExp);
    });

    it("does not set formatPattern for unknown formats", () => {
        const diags: Diagnostic[] = [];
        const tree = walk(
            { type: "string", format: "custom-format" },
            {
                diagnostics: {
                    diagnostics: (d: Diagnostic) => {
                        diags.push(d);
                    },
                },
            }
        );
        if (tree.type !== "string") {
            expect.unreachable("Expected string field");
            return;
        }
        expect(tree.constraints.format).toBe("custom-format");
        expect(tree.constraints.formatPattern).toBeUndefined();
        expect(diags.some((d) => d.code === "unknown-format")).toBe(true);
    });

    it("does not set formatPattern for binary format (file field)", () => {
        const tree = walk({ type: "string", format: "binary" });
        expect(tree.type).toBe("file");
    });

    it("does not set formatPattern for predicate-only formats", () => {
        const tree = walk({ type: "string", format: "iri" });
        if (tree.type !== "string") {
            expect.unreachable("Expected string field");
            return;
        }
        expect(tree.constraints.format).toBe("iri");
        // iri has no regex pattern — only a predicate validator
        expect(tree.constraints.formatPattern).toBeUndefined();
    });
});
