/**
 * Unit tests for format validation patterns.
 *
 * Verifies that each built-in format pattern accepts canonical examples
 * and rejects obvious negatives. Also tests that unknown formats
 * are handled gracefully.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
    FORMAT_PATTERNS,
    MAX_REGEX_PATTERN_LENGTH,
    validateFormat,
} from "../src/core/formats.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
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

    // --- Zod 4 emitted formats ---

    it("cuid accepts canonical cuids and rejects non-cuids", () => {
        const cuid = patternFor("cuid");
        expect(cuid.test("ckopqwooh000001la8mbi2im9")).toBe(true);
        expect(cuid.test("Cabc123")).toBe(true);
        expect(cuid.test("not-a-cuid")).toBe(false);
        expect(cuid.test("c")).toBe(false);
    });

    it("cuid2 accepts cuid2 strings and rejects mixed case", () => {
        const cuid2 = patternFor("cuid2");
        expect(cuid2.test("tz4a98xxat96iws9zmbrgj3a")).toBe(true);
        expect(cuid2.test("abc123")).toBe(true);
        expect(cuid2.test("ABC123")).toBe(false);
        expect(cuid2.test("with-dash")).toBe(false);
    });

    it("nanoid accepts 21-char nanoid strings", () => {
        const nanoid = patternFor("nanoid");
        expect(nanoid.test("V1StGXR8_Z5jdHi6B-myT")).toBe(true);
        expect(nanoid.test("too-short")).toBe(false);
        expect(nanoid.test("V1StGXR8_Z5jdHi6B-myT!")).toBe(false);
    });

    it("cidrv4 accepts valid IPv4 CIDR blocks", () => {
        const cidrv4 = patternFor("cidrv4");
        expect(cidrv4.test("10.0.0.0/8")).toBe(true);
        expect(cidrv4.test("192.168.1.0/24")).toBe(true);
        expect(cidrv4.test("0.0.0.0/0")).toBe(true);
        expect(cidrv4.test("10.0.0.0")).toBe(false);
        expect(cidrv4.test("10.0.0.0/33")).toBe(false);
    });

    it("cidrv6 accepts valid IPv6 CIDR blocks", () => {
        // Zod's cidrv6 regex is intentionally a syntactic prefilter — full
        // address validation is delegated to URL parsing at runtime. The
        // regex therefore accepts simple cases (full 8-group notation,
        // `::`, and `[group]?::groups`) but rejects general compressed
        // forms like `2001:db8::/32`. We test only what the regex itself
        // accepts; the pattern matches what Zod emits as JSON Schema.
        const cidrv6 = patternFor("cidrv6");
        expect(cidrv6.test("::/0")).toBe(true);
        expect(cidrv6.test("::1/128")).toBe(true);
        expect(cidrv6.test("fe80::1/64")).toBe(true);
        expect(cidrv6.test("2001:0db8:85a3:0000:0000:8a2e:0370:7334/128")).toBe(
            true
        );
        expect(cidrv6.test("2001:db8::")).toBe(false);
        expect(cidrv6.test("::/129")).toBe(false);
    });

    it("base64 accepts valid base64 strings", () => {
        const b64 = patternFor("base64");
        expect(b64.test("")).toBe(true);
        expect(b64.test("SGVsbG8=")).toBe(true);
        expect(b64.test("SGVsbG8gV29ybGQ=")).toBe(true);
        expect(b64.test("SGVsbG8gV29ybGRz")).toBe(true);
        expect(b64.test("not_base64!")).toBe(false);
    });

    it("base64url accepts base64url strings", () => {
        const b64u = patternFor("base64url");
        expect(b64u.test("")).toBe(true);
        expect(b64u.test("SGVsbG8gV29ybGQ")).toBe(true);
        expect(b64u.test("abc-_DEF")).toBe(true);
        expect(b64u.test("abc/DEF")).toBe(false);
        expect(b64u.test("abc+DEF")).toBe(false);
    });

    it("e164 accepts E.164 phone numbers", () => {
        const e164 = patternFor("e164");
        expect(e164.test("+14155552671")).toBe(true);
        expect(e164.test("+442071838750")).toBe(true);
        expect(e164.test("14155552671")).toBe(false);
        expect(e164.test("+0123456")).toBe(false);
        expect(e164.test("+12")).toBe(false);
    });

    // --- Additional Zod 4 emitted formats ---

    it("emoji accepts Unicode emoji sequences", () => {
        const emoji = patternFor("emoji");
        expect(emoji.test("\u{1F600}")).toBe(true);
        expect(emoji.test("\u{1F44D}\u{1F44D}")).toBe(true);
        expect(emoji.test("abc")).toBe(false);
        expect(emoji.test("")).toBe(false);
    });

    it("ulid accepts canonical ULIDs", () => {
        const ulid = patternFor("ulid");
        expect(ulid.test("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
        expect(ulid.test("01arz3ndektsv4rrffq69g5fav")).toBe(true);
        // Crockford base32 forbids I, L, O, U.
        expect(ulid.test("01ARZ3NDEKTSV4RRFFQ69G5FAI")).toBe(false);
        expect(ulid.test("not-a-ulid")).toBe(false);
    });

    it("xid accepts 20-char xid strings", () => {
        const xid = patternFor("xid");
        expect(xid.test("9m4e2mr0ui3e8a215n4g")).toBe(true);
        // 'w' is outside the 0-9a-v range.
        expect(xid.test("9m4e2mr0ui3e8a215n4w")).toBe(false);
        expect(xid.test("too-short")).toBe(false);
    });

    it("ksuid accepts 27-char base62 strings", () => {
        const ksuid = patternFor("ksuid");
        expect(ksuid.test("1srOrx2ZWZBpBUvZwXKQmoEYga2")).toBe(true);
        expect(ksuid.test("short")).toBe(false);
        // Non-base62 character.
        expect(ksuid.test("1srOrx2ZWZBpBUvZwXKQmoEYga-")).toBe(false);
    });

    it("lowercase accepts strings with no uppercase letters", () => {
        const lower = patternFor("lowercase");
        expect(lower.test("hello")).toBe(true);
        expect(lower.test("hello123!")).toBe(true);
        expect(lower.test("")).toBe(true);
        expect(lower.test("Hello")).toBe(false);
    });

    it("uppercase accepts strings with no lowercase letters", () => {
        const upper = patternFor("uppercase");
        expect(upper.test("HELLO")).toBe(true);
        expect(upper.test("HELLO123!")).toBe(true);
        expect(upper.test("")).toBe(true);
        expect(upper.test("HEllo")).toBe(false);
    });

    it("jwt accepts the three-segment JWS Compact shape", () => {
        const jwt = patternFor("jwt");
        // alg=HS256, payload {sub: "1234567890"}
        const sample =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        expect(jwt.test(sample)).toBe(true);
        // alg=none — empty signature segment is allowed.
        expect(
            jwt.test("eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.")
        ).toBe(true);
        // Missing segments or too many segments.
        expect(jwt.test("only.two")).toBe(false);
        expect(jwt.test("a.b.c.d")).toBe(false);
        expect(jwt.test("")).toBe(false);
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

    it("json-string accepts strings that parse as JSON", () => {
        expect(validateFormat('{"a":1}', "json-string")).toBe(true);
        expect(validateFormat("[1,2,3]", "json-string")).toBe(true);
        expect(validateFormat('"hello"', "json-string")).toBe(true);
        expect(validateFormat("123", "json-string")).toBe(true);
        expect(validateFormat("true", "json-string")).toBe(true);
        expect(validateFormat("null", "json-string")).toBe(true);
    });

    it("json-string rejects non-JSON strings", () => {
        expect(validateFormat("{a:1}", "json-string")).toBe(false);
        expect(validateFormat("not json", "json-string")).toBe(false);
        expect(validateFormat("", "json-string")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ReDoS guard — regex format
// ---------------------------------------------------------------------------

describe("regex format ReDoS guard", () => {
    it("emits pattern-invalid and rejects malformed patterns", () => {
        const diagnostics: Diagnostic[] = [];
        const result = validateFormat("[invalid", "regex", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect(result).toBe(false);
        const diag = diagnostics.find((d) => d.code === "pattern-invalid");
        expect(diag).toBeDefined();
        expect(diag?.detail?.reason).toBe("compile-error");
    });

    it("emits pattern-invalid and rejects patterns over the length cap", () => {
        const diagnostics: Diagnostic[] = [];
        const longPattern = "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1);
        const result = validateFormat(longPattern, "regex", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect(result).toBe(false);
        const diag = diagnostics.find((d) => d.code === "pattern-invalid");
        expect(diag).toBeDefined();
        expect(diag?.detail?.reason).toBe("length-exceeded");
        expect(diag?.detail?.length).toBe(longPattern.length);
        expect(diag?.detail?.maxLength).toBe(MAX_REGEX_PATTERN_LENGTH);
    });

    it("does not emit when a valid pattern under the cap is supplied", () => {
        const diagnostics: Diagnostic[] = [];
        const result = validateFormat("^[a-z]+$", "regex", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect(result).toBe(true);
        expect(
            diagnostics.filter((d) => d.code === "pattern-invalid").length
        ).toBe(0);
    });

    it("treats a pattern exactly at the length cap as valid if syntactically correct", () => {
        const diagnostics: Diagnostic[] = [];
        const padding = "a".repeat(MAX_REGEX_PATTERN_LENGTH - 2);
        const result = validateFormat(`^${padding}$`, "regex", {
            diagnostics: (d) => diagnostics.push(d),
        });
        expect(result).toBe(true);
        expect(
            diagnostics.filter((d) => d.code === "pattern-invalid").length
        ).toBe(0);
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

// ---------------------------------------------------------------------------
// Zod 4 emitted formats — round-trip through the library
// ---------------------------------------------------------------------------

describe("Zod 4 emitted format round-trip", () => {
    /**
     * Builders for the formats that previously triggered `unknown-format`
     * diagnostics. Most use the canonical Zod 4 constructor; `cuid` is
     * constructed manually because z.cuid() is deprecated by Zod itself
     * (CUID v1 leaks timestamps via embedded timestamps) — yet Zod 4 still
     * emits `format: "cuid"` for legacy schemas, so the library must
     * handle it gracefully.
     */
    const cases: readonly (readonly [string, () => z.ZodType])[] = [
        // z.cuid() is @deprecated — we construct an equivalent schema by
        // calling .regex() with format metadata to avoid the deprecated API
        // while still producing { type: "string", format: "cuid", ... }.
        [
            "cuid",
            () =>
                z
                    .string()
                    .regex(/^[cC][0-9a-z]{6,}$/)
                    .meta({ format: "cuid" }),
        ],
        ["cuid2", () => z.cuid2()],
        ["nanoid", () => z.nanoid()],
        ["cidrv4", () => z.cidrv4()],
        ["cidrv6", () => z.cidrv6()],
        ["base64", () => z.base64()],
        ["base64url", () => z.base64url()],
        ["e164", () => z.e164()],
        // Newly registered Zod 4 formats — each round-trips through
        // z.toJSONSchema() and surfaces with a derived FORMAT_PATTERNS entry,
        // confirming no `unknown-format` diagnostic fires.
        ["emoji", () => z.emoji()],
        ["ulid", () => z.ulid()],
        ["xid", () => z.xid()],
        ["ksuid", () => z.ksuid()],
        ["jwt", () => z.jwt()],
        ["lowercase", () => z.string().lowercase()],
        ["uppercase", () => z.string().uppercase()],
    ];

    it.each(cases)(
        "%s round-trips with derived formatPattern",
        (name, build) => {
            const { jsonSchema } = normaliseSchema(build());
            const diags: Diagnostic[] = [];
            const tree = walk(jsonSchema, {
                diagnostics: {
                    diagnostics: (d: Diagnostic) => {
                        diags.push(d);
                    },
                },
            });
            if (tree.type !== "string") {
                expect.unreachable(`Expected string field for ${name}`);
                return;
            }
            expect(tree.constraints.format).toBe(name);
            expect(tree.constraints.formatPattern).toBeInstanceOf(RegExp);
            expect(diags.some((d) => d.code === "unknown-format")).toBe(false);
            // The derived pattern matches the one in the FORMAT_PATTERNS registry.
            expect(tree.constraints.formatPattern).toBe(FORMAT_PATTERNS[name]);
        }
    );
});
