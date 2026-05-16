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
 * This avoids `!` assertions while keeping tests concise.
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
});
