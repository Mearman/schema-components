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
// FORMAT_PATTERNS — canonical positives
// ---------------------------------------------------------------------------

describe("FORMAT_PATTERNS", () => {
    it("uuid accepts canonical UUIDs", () => {
        expect(
            FORMAT_PATTERNS.uuid.test("550e8400-e29b-41d4-a716-446655440000")
        ).toBe(true);
        expect(
            FORMAT_PATTERNS.uuid.test("00000000-0000-0000-0000-000000000000")
        ).toBe(true);
    });

    it("uuid rejects non-UUIDs", () => {
        expect(FORMAT_PATTERNS.uuid.test("not-a-uuid")).toBe(false);
        expect(FORMAT_PATTERNS.uuid.test("550e8400-e29b-41d4-a716")).toBe(
            false
        );
    });

    it("email accepts valid emails", () => {
        expect(FORMAT_PATTERNS.email.test("user@example.com")).toBe(true);
        expect(FORMAT_PATTERNS.email.test("a@b.co")).toBe(true);
    });

    it("email rejects invalid emails", () => {
        expect(FORMAT_PATTERNS.email.test("not-an-email")).toBe(false);
        expect(FORMAT_PATTERNS.email.test("@example.com")).toBe(false);
        expect(FORMAT_PATTERNS.email.test("user@")).toBe(false);
    });

    it("date-time accepts ISO 8601 datetime", () => {
        expect(FORMAT_PATTERNS["date-time"].test("2024-01-15T10:30:00Z")).toBe(
            true
        );
        expect(
            FORMAT_PATTERNS["date-time"].test("2024-01-15T10:30:00+05:30")
        ).toBe(true);
        expect(
            FORMAT_PATTERNS["date-time"].test("2024-01-15T10:30:00.123Z")
        ).toBe(true);
    });

    it("date-time rejects invalid datetimes", () => {
        expect(FORMAT_PATTERNS["date-time"].test("2024-01-15")).toBe(false);
        expect(FORMAT_PATTERNS["date-time"].test("not-a-date")).toBe(false);
    });

    it("date accepts YYYY-MM-DD", () => {
        expect(FORMAT_PATTERNS.date.test("2024-01-15")).toBe(true);
    });

    it("date rejects non-dates", () => {
        expect(FORMAT_PATTERNS.date.test("2024/01/15")).toBe(false);
        expect(FORMAT_PATTERNS.date.test("not-a-date")).toBe(false);
    });

    it("time accepts HH:MM:SS", () => {
        expect(FORMAT_PATTERNS.time.test("10:30:00")).toBe(true);
        expect(FORMAT_PATTERNS.time.test("10:30:00Z")).toBe(true);
        expect(FORMAT_PATTERNS.time.test("10:30:00.123+05:30")).toBe(true);
    });

    it("time rejects invalid times", () => {
        expect(FORMAT_PATTERNS.time.test("not-a-time")).toBe(false);
    });

    it("ipv4 accepts valid IPv4 addresses", () => {
        expect(FORMAT_PATTERNS.ipv4.test("192.168.1.1")).toBe(true);
        expect(FORMAT_PATTERNS.ipv4.test("0.0.0.0")).toBe(true);
    });

    it("ipv4 rejects invalid IPv4", () => {
        expect(FORMAT_PATTERNS.ipv4.test("not-an-ip")).toBe(false);
        expect(FORMAT_PATTERNS.ipv4.test("1.2.3")).toBe(false);
    });

    it("ipv6 accepts valid IPv6 addresses", () => {
        expect(FORMAT_PATTERNS.ipv6.test("::1")).toBe(true);
        expect(
            FORMAT_PATTERNS.ipv6.test("2001:0db8:85a3:0000:0000:8a2e:0370:7334")
        ).toBe(true);
    });

    it("uri accepts valid URIs", () => {
        expect(FORMAT_PATTERNS.uri.test("https://example.com")).toBe(true);
        expect(FORMAT_PATTERNS.uri.test("ftp://files.example.com")).toBe(true);
    });

    it("uri rejects invalid URIs", () => {
        expect(FORMAT_PATTERNS.uri.test("not a uri")).toBe(false);
    });

    it("hostname accepts valid hostnames", () => {
        expect(FORMAT_PATTERNS.hostname.test("example.com")).toBe(true);
        expect(FORMAT_PATTERNS.hostname.test("sub.domain.example.com")).toBe(
            true
        );
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
