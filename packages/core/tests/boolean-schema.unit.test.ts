/**
 * Tests for boolean schema handling (true/false at sub-schema positions).
 *
 * JSON Schema Draft 06+ permits `true` (vacuously valid) and `false`
 * (vacuously invalid) at any sub-schema position. The walker must handle
 * these correctly instead of silently dropping them.
 */

import { describe, it, expect } from "vitest";
import { walk } from "../src/core/walker.ts";

// ---------------------------------------------------------------------------
// Top-level boolean schemas
// ---------------------------------------------------------------------------

describe("top-level boolean schemas", () => {
    it("true produces unknown (permissive)", () => {
        const tree = walk(true);
        expect(tree.type).toBe("unknown");
        expect(tree.editability).toBe("editable");
    });

    it("false produces never (rejecting)", () => {
        const tree = walk(false);
        expect(tree.type).toBe("never");
        expect(tree.editability).toBe("presentation");
    });
});

// ---------------------------------------------------------------------------
// Boolean schemas in properties
// ---------------------------------------------------------------------------

describe("boolean schemas in properties", () => {
    it("property with false schema renders as never", () => {
        const tree = walk({
            type: "object",
            properties: {
                forbidden: false,
            },
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        const forbidden = tree.fields.forbidden;
        expect(forbidden).toBeDefined();
        if (forbidden === undefined) return;
        expect(forbidden.type).toBe("never");
    });

    it("property with true schema renders as unknown (permissive)", () => {
        const tree = walk({
            type: "object",
            properties: {
                anything: true,
            },
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        const anything = tree.fields.anything;
        expect(anything).toBeDefined();
        if (anything === undefined) return;
        expect(anything.type).toBe("unknown");
    });
});

// ---------------------------------------------------------------------------
// Boolean additionalProperties
// ---------------------------------------------------------------------------

describe("boolean additionalProperties", () => {
    it("additionalProperties: true produces permissive schema", () => {
        const tree = walk({
            type: "object",
            properties: { name: { type: "string" } },
            additionalProperties: true,
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.additionalPropertiesClosed).toBeUndefined();
        expect(tree.additionalPropertiesSchema).toBeDefined();
        if (tree.additionalPropertiesSchema !== undefined) {
            expect(tree.additionalPropertiesSchema.type).toBe("unknown");
        }
    });

    it("additionalProperties: false closes the object", () => {
        const tree = walk({
            type: "object",
            properties: { name: { type: "string" } },
            additionalProperties: false,
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.additionalPropertiesClosed).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Boolean unevaluatedProperties
// ---------------------------------------------------------------------------

describe("boolean unevaluatedProperties", () => {
    it("unevaluatedProperties: true produces permissive schema", () => {
        const tree = walk({
            type: "object",
            properties: { name: { type: "string" } },
            unevaluatedProperties: true,
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.unevaluatedPropertiesClosed).toBeUndefined();
        expect(tree.unevaluatedProperties).toBeDefined();
        if (tree.unevaluatedProperties !== undefined) {
            expect(tree.unevaluatedProperties.type).toBe("unknown");
        }
    });

    it("unevaluatedProperties: false closes the object", () => {
        const tree = walk({
            type: "object",
            properties: { name: { type: "string" } },
            unevaluatedProperties: false,
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.unevaluatedPropertiesClosed).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Boolean schemas in composition (allOf, anyOf, oneOf)
// ---------------------------------------------------------------------------

describe("boolean schemas in composition", () => {
    it("true in anyOf is handled", () => {
        const tree = walk({
            anyOf: [true, { type: "string" }],
        });
        expect(tree.type).toBe("union");
        if (tree.type !== "union") return;
        expect(tree.options.length).toBe(2);
    });

    it("false in oneOf is handled", () => {
        const tree = walk({
            oneOf: [false, { type: "string" }],
        });
        expect(tree.type).toBe("union");
        if (tree.type !== "union") return;
        expect(tree.options.length).toBe(2);
        const first = tree.options[0];
        if (first === undefined) return;
        expect(first.type).toBe("never");
    });
});

// ---------------------------------------------------------------------------
// Boolean sub-schemas at if/then/else
// ---------------------------------------------------------------------------

describe("boolean schemas at if/then/else", () => {
    it("if: true produces an unknown ifClause", () => {
        const tree = walk({ if: true, then: { type: "string" } });
        expect(tree.type).toBe("conditional");
        if (tree.type !== "conditional") return;
        expect(tree.ifClause.type).toBe("unknown");
        expect(tree.thenClause?.type).toBe("string");
    });

    it("if: false produces a never ifClause", () => {
        const tree = walk({ if: false, else: { type: "number" } });
        expect(tree.type).toBe("conditional");
        if (tree.type !== "conditional") return;
        expect(tree.ifClause.type).toBe("never");
        expect(tree.elseClause?.type).toBe("number");
    });

    it("then: false produces a never thenClause", () => {
        const tree = walk({
            if: { type: "string" },
            then: false,
        });
        expect(tree.type).toBe("conditional");
        if (tree.type !== "conditional") return;
        expect(tree.thenClause?.type).toBe("never");
    });

    it("else: true produces an unknown elseClause", () => {
        const tree = walk({
            if: { type: "string" },
            else: true,
        });
        expect(tree.type).toBe("conditional");
        if (tree.type !== "conditional") return;
        expect(tree.elseClause?.type).toBe("unknown");
    });
});

// ---------------------------------------------------------------------------
// Boolean sub-schemas at not / propertyNames
// ---------------------------------------------------------------------------

describe("boolean schemas at not", () => {
    it("not: false produces a never negation", () => {
        const tree = walk({ not: false });
        expect(tree.type).toBe("negation");
        if (tree.type !== "negation") return;
        expect(tree.negated.type).toBe("never");
    });

    it("not: true produces an unknown negation", () => {
        const tree = walk({ not: true });
        expect(tree.type).toBe("negation");
        if (tree.type !== "negation") return;
        expect(tree.negated.type).toBe("unknown");
    });
});

describe("boolean schemas at propertyNames", () => {
    it("propertyNames: true is preserved as unknown", () => {
        const tree = walk({
            type: "object",
            properties: { name: { type: "string" } },
            propertyNames: true,
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.propertyNames?.type).toBe("unknown");
    });

    it("propertyNames: false is preserved as never", () => {
        const tree = walk({
            type: "object",
            properties: { name: { type: "string" } },
            propertyNames: false,
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.propertyNames?.type).toBe("never");
    });
});

// ---------------------------------------------------------------------------
// Boolean sub-schemas in patternProperties / dependentSchemas
// ---------------------------------------------------------------------------

describe("boolean schemas in patternProperties", () => {
    it("preserves boolean values in patternProperties", () => {
        const tree = walk({
            type: "object",
            properties: { name: { type: "string" } },
            patternProperties: {
                "^x": true,
                "^y": false,
            },
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.patternProperties?.["^x"]?.type).toBe("unknown");
        expect(tree.patternProperties?.["^y"]?.type).toBe("never");
    });
});

describe("boolean schemas in dependentSchemas", () => {
    it("preserves boolean values in dependentSchemas", () => {
        const tree = walk({
            type: "object",
            properties: {
                a: { type: "string" },
                b: { type: "string" },
            },
            dependentSchemas: {
                a: true,
                b: false,
            },
        });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;
        expect(tree.dependentSchemas?.a?.type).toBe("unknown");
        expect(tree.dependentSchemas?.b?.type).toBe("never");
    });
});
