/**
 * JSON Schema conformance harness — inline fixtures.
 *
 * A curated set of representative schemas drawn from the JSON Schema
 * Test Suite patterns. Each schema is walked through the normaliser and
 * walker, asserting no crash and meaningful output.
 *
 * Organised by draft version. Covers the constructs most likely to
 * regress: boolean schemas, dependencies, $ref siblings, contentSchema,
 * composition, and format validation.
 */

import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";
import type { WalkedField } from "../src/core/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkQuietly(schema: unknown): {
    result: WalkedField;
    diags: Diagnostic[];
} {
    const diags: Diagnostic[] = [];
    const sink = (d: Diagnostic) => {
        diags.push(d);
    };
    const normalised = normaliseSchema(schema, undefined, {
        diagnostics: { diagnostics: sink },
    });
    const result = walk(normalised.jsonSchema, {
        rootDocument: normalised.rootDocument,
        diagnostics: { diagnostics: sink },
    });
    return { result, diags };
}

// ---------------------------------------------------------------------------
// Draft 2020-12
// ---------------------------------------------------------------------------

describe("conformance — Draft 2020-12", () => {
    it("prefixItems tuple validation", () => {
        const { result } = walkQuietly({
            type: "array",
            prefixItems: [{ type: "string" }, { type: "number" }],
        });
        if (result.type !== "tuple") {
            expect.unreachable("Expected tuple");
            return;
        }
        expect(result.prefixItems.length).toBe(2);
        expect(result.prefixItems[0]?.type).toBe("string");
        expect(result.prefixItems[1]?.type).toBe("number");
    });

    it("dynamicRef to root (recursive schema)", () => {
        const { result } = walkQuietly({
            $dynamicAnchor: "node",
            type: "object",
            properties: {
                children: {
                    type: "array",
                    items: { $dynamicRef: "#node" },
                },
            },
        });
        expect(result.type).toBe("object");
    });

    it("dependentRequired and dependentSchemas", () => {
        const { result } = walkQuietly({
            type: "object",
            properties: {
                creditCard: { type: "string" },
                billingAddress: { type: "string" },
                age: { type: "number" },
            },
            dependentRequired: { creditCard: ["billingAddress"] },
            dependentSchemas: {
                age: {
                    properties: { name: { type: "string" } },
                    required: ["name"],
                },
            },
        });
        if (result.type !== "object") {
            expect.unreachable("Expected object");
            return;
        }
        expect(result.dependentRequired).toStrictEqual({
            creditCard: ["billingAddress"],
        });
        expect(result.dependentSchemas).toBeDefined();
    });

    it("boolean schema false in properties", () => {
        const { result } = walkQuietly({
            type: "object",
            properties: {
                allowed: { type: "string" },
                forbidden: false,
            },
        });
        if (result.type !== "object") {
            expect.unreachable("Expected object");
            return;
        }
        const forbidden = result.fields.forbidden;
        expect(forbidden).toBeDefined();
        if (forbidden === undefined) return;
        expect(forbidden.type).toBe("never");
    });

    it("$ref with annotation siblings", () => {
        const { result } = walkQuietly({
            type: "object",
            properties: {
                user: {
                    $ref: "#/$defs/User",
                    description: "Current user",
                },
            },
            $defs: {
                User: {
                    type: "string",
                    description: "A user",
                },
            },
        });
        if (result.type !== "object") {
            expect.unreachable("Expected object");
            return;
        }
        const user = result.fields.user;
        expect(user).toBeDefined();
        if (user === undefined) return;
        expect(user.meta.description).toBe("Current user");
    });

    it("contentSchema on encoded string", () => {
        const { result } = walkQuietly({
            type: "string",
            contentEncoding: "base64",
            contentMediaType: "application/json",
            contentSchema: {
                type: "object",
                properties: { id: { type: "integer" } },
            },
        });
        if (result.type !== "string") {
            expect.unreachable("Expected string");
            return;
        }
        expect(result.constraints.contentEncoding).toBe("base64");
        expect(result.meta.decodedSchema).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Draft 2019-09
// ---------------------------------------------------------------------------

describe("conformance — Draft 2019-09", () => {
    it("recursiveRef to root", () => {
        const { result } = walkQuietly({
            $recursiveAnchor: true,
            type: "object",
            properties: {
                name: { type: "string" },
                children: {
                    type: "array",
                    items: { $recursiveRef: "#" },
                },
            },
        });
        expect(result.type).toBe("object");
    });

    it("unevaluatedProperties false", () => {
        const { result } = walkQuietly({
            type: "object",
            properties: { name: { type: "string" } },
            unevaluatedProperties: false,
        });
        if (result.type !== "object") {
            expect.unreachable("Expected object");
            return;
        }
        expect(result.unevaluatedPropertiesClosed).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Draft 07
// ---------------------------------------------------------------------------

describe("conformance — Draft 07", () => {
    it("if/then/else conditional", () => {
        const { result, diags } = walkQuietly({
            type: "object",
            properties: { kind: { type: "string" } },
            if: {
                properties: { kind: { const: "A" } },
            },
            then: {
                properties: { a: { type: "string" } },
            },
            else: {
                properties: { b: { type: "number" } },
            },
        });
        expect(result.type).toBe("conditional");
        expect(diags.some((d) => d.code === "conditional-fallback")).toBe(true);
    });

    it("contentEncoding and contentMediaType", () => {
        const { result } = walkQuietly({
            type: "string",
            contentEncoding: "base64",
            contentMediaType: "text/plain",
        });
        if (result.type !== "string") {
            expect.unreachable("Expected string");
            return;
        }
        expect(result.constraints.contentEncoding).toBe("base64");
        expect(result.constraints.contentMediaType).toBe("text/plain");
    });
});

// ---------------------------------------------------------------------------
// Draft 06
// ---------------------------------------------------------------------------

describe("conformance — Draft 06", () => {
    it("const and exclusiveMinimum as number", () => {
        const { result } = walkQuietly({
            type: "number",
            exclusiveMinimum: 0,
            const: 42,
        });
        expect(result.type).toBe("literal");
    });

    it("propertyNames", () => {
        const { result } = walkQuietly({
            type: "object",
            properties: {},
            propertyNames: { pattern: "^[a-z]+$" },
        });
        if (result.type !== "object") {
            expect.unreachable("Expected object");
            return;
        }
        expect(result.propertyNames).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Draft 04
// ---------------------------------------------------------------------------

describe("conformance — Draft 04", () => {
    it("exclusiveMinimum boolean → number", () => {
        const { result } = walkQuietly({
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "number",
            minimum: 5,
            exclusiveMinimum: true,
        });
        if (result.type !== "number") {
            expect.unreachable("Expected number");
            return;
        }
        expect(result.constraints.exclusiveMinimum).toBe(5);
        expect(result.constraints.minimum).toBeUndefined();
    });

    it("dependencies split", () => {
        const { result } = walkQuietly({
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                creditCard: { type: "string" },
                billingAddress: { type: "string" },
            },
            dependencies: {
                creditCard: ["billingAddress"],
            },
        });
        if (result.type !== "object") {
            expect.unreachable("Expected object");
            return;
        }
        expect(result.dependentRequired).toStrictEqual({
            creditCard: ["billingAddress"],
        });
    });

    it("id → $id normalisation", () => {
        const { result } = walkQuietly({
            $schema: "http://json-schema.org/draft-04/schema#",
            id: "MySchema",
            type: "string",
        });
        expect(result.type).toBe("string");
    });

    it("definitions ref resolution", () => {
        const { result } = walkQuietly({
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                user: { $ref: "#/definitions/User" },
            },
            definitions: {
                User: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                    },
                },
            },
        });
        if (result.type !== "object") {
            expect.unreachable("Expected object");
            return;
        }
        const user = result.fields.user;
        expect(user).toBeDefined();
        if (user === undefined) return;
        expect(user.type).toBe("object");
    });
});

// ---------------------------------------------------------------------------
// Format validation across drafts
// ---------------------------------------------------------------------------

describe("conformance — format patterns", () => {
    const formatCases = [
        { format: "email", valid: "user@example.com", invalid: "not-email" },
        {
            format: "uuid",
            valid: "550e8400-e29b-41d4-a716-446655440000",
            invalid: "not-uuid",
        },
        { format: "date", valid: "2024-01-15", invalid: "2024/01/15" },
        {
            format: "date-time",
            valid: "2024-01-15T10:30:00Z",
            invalid: "2024-01-15",
        },
        { format: "uri", valid: "https://example.com", invalid: "not a uri" },
        { format: "ipv4", valid: "192.168.1.1", invalid: "not-ip" },
        { format: "json-pointer", valid: "/foo/bar", invalid: "foo" },
        { format: "duration", valid: "PT1H", invalid: "P" },
    ];

    for (const { format, valid, invalid } of formatCases) {
        it(`format ${format} produces formatPattern`, () => {
            const { result } = walkQuietly({ type: "string", format });
            if (result.type !== "string") {
                expect.unreachable("Expected string");
                return;
            }
            expect(result.constraints.format).toBe(format);
            expect(result.constraints.formatPattern).toBeInstanceOf(RegExp);
            expect(result.constraints.formatPattern?.test(valid)).toBe(true);
            expect(result.constraints.formatPattern?.test(invalid)).toBe(false);
        });
    }
});

// ---------------------------------------------------------------------------
// Heuristic draft detection (unversioned schemas)
// ---------------------------------------------------------------------------

describe("conformance — heuristic draft detection", () => {
    it("infers Draft 04 from boolean exclusiveMinimum", () => {
        const { result, diags } = walkQuietly({
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
        });
        if (result.type !== "number") {
            expect.unreachable("Expected number");
            return;
        }
        // Should have been normalised: exclusiveMinimum: true + minimum: 0 → exclusiveMinimum: 0
        expect(result.constraints.exclusiveMinimum).toBe(0);
        expect(result.constraints.minimum).toBeUndefined();
        expect(diags.some((d) => d.code === "assumed-draft")).toBe(true);
    });

    it("infers Draft 07 from if/then/else", () => {
        const { diags } = walkQuietly({
            type: "object",
            if: { type: "string" },
        });
        const assumed = diags.filter((d) => d.code === "assumed-draft");
        expect(assumed.length).toBe(1);
        const diag = assumed[0];
        if (diag === undefined) return;
        expect(diag.detail?.draft).toBe("draft-07");
    });
});
