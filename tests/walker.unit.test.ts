/**
 * Unit tests for resolveEditability and the schema walker.
 *
 * Tests the three-source editability resolution (property, component, root)
 * and the walker's handling of field overrides, nested overrides,
 * and readOnly/writeOnly propagation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { resolveEditability } from "../src/core/types.ts";
import { walk } from "../src/core/walker.ts";
import type { WalkedField } from "../src/core/types.ts";

// Helper: non-null field access for tests (the walker returns optional
// fields, but our test schemas produce deterministic structures).
function getField(tree: WalkedField, ...keys: string[]): WalkedField {
    let current: WalkedField = tree;
    for (const key of keys) {
        const fields = current.fields;
        assert.ok(fields, `Expected fields at ${keys.join(".")}`);
        const child = fields[key];
        assert.ok(child, `Expected field "${key}" at ${keys.join(".")}`);
        current = child;
    }
    return current;
}

// ---------------------------------------------------------------------------
// resolveEditability
// ---------------------------------------------------------------------------

describe("resolveEditability", () => {
    it("returns editable when no meta is set", () => {
        assert.equal(
            resolveEditability(undefined, undefined, undefined),
            "editable"
        );
    });

    it("returns presentation for property-level readOnly: true", () => {
        assert.equal(
            resolveEditability({ readOnly: true }, undefined, undefined),
            "presentation"
        );
    });

    it("returns input for property-level writeOnly: true", () => {
        assert.equal(
            resolveEditability({ writeOnly: true }, undefined, undefined),
            "input"
        );
    });

    it("readOnly takes priority over writeOnly at the same level", () => {
        assert.equal(
            resolveEditability(
                { readOnly: true, writeOnly: true },
                undefined,
                undefined
            ),
            "presentation"
        );
    });

    it("property-level overrides component-level", () => {
        assert.equal(
            resolveEditability(
                { readOnly: true },
                { readOnly: false },
                undefined
            ),
            "presentation"
        );
    });

    it("component-level is used when property has no override", () => {
        assert.equal(
            resolveEditability(undefined, { readOnly: true }, undefined),
            "presentation"
        );
    });

    it("root-level is used when property and component have no override", () => {
        assert.equal(
            resolveEditability(undefined, undefined, { readOnly: true }),
            "presentation"
        );
    });

    it("property-level overrides root-level", () => {
        assert.equal(
            resolveEditability({ writeOnly: true }, undefined, {
                readOnly: true,
            }),
            "input"
        );
    });

    it("readOnly: false at property level overrides component readOnly: true", () => {
        assert.equal(
            resolveEditability(
                { readOnly: false },
                { readOnly: true },
                undefined
            ),
            "editable"
        );
    });

    it("writeOnly: false at property level overrides component writeOnly: true", () => {
        assert.equal(
            resolveEditability(
                { writeOnly: false },
                { writeOnly: true },
                undefined
            ),
            "editable"
        );
    });

    it("readOnly: false at property level overrides root readOnly: true", () => {
        assert.equal(
            resolveEditability({ readOnly: false }, undefined, {
                readOnly: true,
            }),
            "editable"
        );
    });

    it("readOnly: false without any higher-level override is just editable", () => {
        assert.equal(
            resolveEditability({ readOnly: false }, undefined, undefined),
            "editable"
        );
    });

    it("writeOnly: true takes priority when readOnly: false is also set", () => {
        assert.equal(
            resolveEditability(
                { readOnly: false, writeOnly: true },
                undefined,
                undefined
            ),
            "input"
        );
    });
});

// ---------------------------------------------------------------------------
// Walker — basic schema types
// ---------------------------------------------------------------------------

describe("walk — basic types", () => {
    it("walks a string field", () => {
        const tree = walk(z.string(), {});
        assert.equal(tree.type, "string");
        assert.equal(tree.editability, "editable");
    });

    it("walks a number field", () => {
        const tree = walk(z.number(), {});
        assert.equal(tree.type, "number");
    });

    it("walks a boolean field", () => {
        const tree = walk(z.boolean(), {});
        assert.equal(tree.type, "boolean");
    });

    it("walks an enum", () => {
        const tree = walk(z.enum(["admin", "editor", "viewer"]), {});
        assert.equal(tree.type, "enum");
        assert.deepEqual(tree.enumValues, ["admin", "editor", "viewer"]);
    });

    it("walks a literal", () => {
        const tree = walk(z.literal("active"), {});
        assert.equal(tree.type, "literal");
        assert.deepEqual(tree.literalValues, ["active"]);
    });

    it("returns unknown for non-Zod input", () => {
        const tree = walk("not a schema", {});
        assert.equal(tree.type, "unknown");
    });
});

// ---------------------------------------------------------------------------
// Walker — object fields
// ---------------------------------------------------------------------------

describe("walk — objects", () => {
    const schema = z.object({
        name: z.string(),
        age: z.number(),
    });

    it("walks an object with fields", () => {
        const tree = walk(schema, {});
        assert.equal(tree.type, "object");
        assert.ok(tree.fields);
        assert.ok("name" in tree.fields);
        assert.ok("age" in tree.fields);
    });

    it("infers string type for name field", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "name").type, "string");
    });

    it("infers number type for age field", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "age").type, "number");
    });
});

// ---------------------------------------------------------------------------
// Walker — nested objects
// ---------------------------------------------------------------------------

describe("walk — nested objects", () => {
    const schema = z.object({
        name: z.string(),
        address: z.object({
            street: z.string(),
            city: z.string(),
            postcode: z.string(),
        }),
    });

    it("walks nested objects", () => {
        const tree = walk(schema, {});
        const address = getField(tree, "address");
        assert.equal(address.type, "object");
        assert.equal(getField(tree, "address", "street").type, "string");
    });
});

// ---------------------------------------------------------------------------
// Walker — editability resolution
// ---------------------------------------------------------------------------

describe("walk — editability", () => {
    const schema = z.object({
        id: z.string(),
        name: z.string(),
        password: z.string(),
    });

    it("defaults to editable", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "name").editability, "editable");
    });

    it("component readOnly makes all fields presentation", () => {
        const tree = walk(schema, { componentMeta: { readOnly: true } });
        assert.equal(getField(tree, "id").editability, "presentation");
        assert.equal(getField(tree, "name").editability, "presentation");
    });

    it("component writeOnly makes all fields input", () => {
        const tree = walk(schema, { componentMeta: { writeOnly: true } });
        assert.equal(getField(tree, "name").editability, "input");
    });

    it("root readOnly makes all fields presentation", () => {
        const tree = walk(schema, { rootMeta: { readOnly: true } });
        assert.equal(getField(tree, "name").editability, "presentation");
    });

    it("property readOnly overrides component writeOnly", () => {
        const idWithMeta = z.string().meta({ readOnly: true });
        const schemaWithMeta = z.object({ id: idWithMeta, name: z.string() });
        const tree = walk(schemaWithMeta, {
            componentMeta: { writeOnly: true },
        });
        assert.equal(getField(tree, "id").editability, "presentation");
        assert.equal(getField(tree, "name").editability, "input");
    });
});

// ---------------------------------------------------------------------------
// Walker — field overrides
// ---------------------------------------------------------------------------

describe("walk — field overrides", () => {
    const schema = z.object({
        name: z.string(),
        age: z.number(),
        address: z.object({
            street: z.string(),
            city: z.string(),
        }),
    });

    it("applies top-level field override", () => {
        const tree = walk(schema, {
            fieldOverrides: { name: { readOnly: true } },
        });
        assert.equal(getField(tree, "name").editability, "presentation");
        assert.equal(getField(tree, "age").editability, "editable");
    });

    it("applies nested field override", () => {
        const tree = walk(schema, {
            fieldOverrides: { address: { city: { readOnly: true } } },
        });
        assert.equal(
            getField(tree, "address", "city").editability,
            "presentation"
        );
        assert.equal(
            getField(tree, "address", "street").editability,
            "editable"
        );
    });

    it("meta fields on an object override are extracted", () => {
        const tree = walk(schema, {
            fieldOverrides: {
                address: { description: "Home", readOnly: true },
            },
        });
        assert.equal(getField(tree, "address").editability, "presentation");
        assert.equal(getField(tree, "address").meta.description, "Home");
    });

    it("readOnly: false overrides component readOnly for the subtree", () => {
        const tree = walk(schema, {
            componentMeta: { readOnly: true },
            fieldOverrides: { address: { readOnly: false } },
        });
        assert.equal(getField(tree, "address").editability, "editable");
        assert.equal(
            getField(tree, "address", "street").editability,
            "editable"
        );
        assert.equal(getField(tree, "address", "city").editability, "editable");
        assert.equal(getField(tree, "name").editability, "presentation");
    });

    it("readOnly: true on nested child overrides parent readOnly: false", () => {
        const tree = walk(schema, {
            componentMeta: { readOnly: true },
            fieldOverrides: {
                address: { readOnly: false, city: { readOnly: true } },
            },
        });
        assert.equal(getField(tree, "address").editability, "editable");
        assert.equal(
            getField(tree, "address", "street").editability,
            "editable"
        );
        assert.equal(
            getField(tree, "address", "city").editability,
            "presentation"
        );
    });
});

// ---------------------------------------------------------------------------
// Walker — constraints
// ---------------------------------------------------------------------------

describe("walk — constraints", () => {
    it("extracts string constraints", () => {
        const tree = walk(z.string().min(1).max(100), {});
        assert.equal(tree.constraints.minLength, 1);
        assert.equal(tree.constraints.maxLength, 100);
    });

    it("extracts number constraints", () => {
        const tree = walk(z.number().min(0).max(150), {});
        assert.equal(tree.constraints.minimum, 0);
        assert.equal(tree.constraints.maximum, 150);
    });

    it("extracts email format", () => {
        const tree = walk(z.email(), {});
        assert.equal(tree.constraints.format, "email");
    });

    it("extracts url format", () => {
        const tree = walk(z.url(), {});
        assert.equal(tree.constraints.format, "url");
    });
});

// ---------------------------------------------------------------------------
// Walker — wrappers (optional, nullable, default, readonly)
// ---------------------------------------------------------------------------

describe("walk — wrappers", () => {
    it("unwraps optional", () => {
        const tree = walk(z.string().optional(), {});
        assert.equal(tree.type, "string");
        assert.equal(tree.isOptional, true);
    });

    it("unwraps nullable", () => {
        const tree = walk(z.string().nullable(), {});
        assert.equal(tree.type, "string");
        assert.equal(tree.isNullable, true);
    });

    it("unwraps default", () => {
        const tree = walk(z.string().default("hello"), {});
        assert.equal(tree.type, "string");
        assert.equal(tree.defaultValue, "hello");
    });

    it("unwraps readonly — marks as readOnly in meta", () => {
        const tree = walk(z.string().readonly(), {});
        assert.equal(tree.type, "string");
        assert.equal(tree.meta.readOnly, true);
    });

    it("unwraps multiple layers", () => {
        const tree = walk(z.string().optional().nullable().default("x"), {});
        assert.equal(tree.type, "string");
        assert.equal(tree.isOptional, true);
        assert.equal(tree.isNullable, true);
        assert.equal(tree.defaultValue, "x");
    });
});

// ---------------------------------------------------------------------------
// Walker — arrays
// ---------------------------------------------------------------------------

describe("walk — arrays", () => {
    it("walks an array with element schema", () => {
        const tree = walk(z.array(z.string()), {});
        assert.equal(tree.type, "array");
        assert.ok(tree.element);
        assert.equal(tree.element.type, "string");
    });

    it("walks an array of objects", () => {
        const tree = walk(z.array(z.object({ name: z.string() })), {});
        assert.equal(tree.type, "array");
        assert.ok(tree.element);
        assert.equal(tree.element.type, "object");
        assert.ok(tree.element.fields);
        assert.ok(tree.element.fields.name);
    });
});

// ---------------------------------------------------------------------------
// Walker — unions
// ---------------------------------------------------------------------------

describe("walk — unions", () => {
    it("walks a union", () => {
        const tree = walk(z.union([z.string(), z.number()]), {});
        assert.equal(tree.type, "union");
        assert.ok(tree.options);
        assert.equal(tree.options.length, 2);
    });

    it("walks a discriminated union", () => {
        const tree = walk(
            z.discriminatedUnion("type", [
                z.object({ type: z.literal("a"), value: z.string() }),
                z.object({ type: z.literal("b"), count: z.number() }),
            ]),
            {}
        );
        assert.equal(tree.type, "discriminatedUnion");
        assert.equal(tree.discriminator, "type");
    });
});

// ---------------------------------------------------------------------------
// Walker — meta extraction
// ---------------------------------------------------------------------------

describe("walk — meta", () => {
    it("extracts description from .describe()", () => {
        const tree = walk(z.string().describe("Full name"), {});
        assert.equal(tree.meta.description, "Full name");
    });

    it("extracts custom meta via .meta()", () => {
        const tree = walk(
            z.string().meta({ description: "Email", component: "text" }),
            {}
        );
        assert.equal(tree.meta.description, "Email");
        assert.equal(tree.meta.component, "text");
    });

    it("extracts readOnly from .meta()", () => {
        const tree = walk(z.string().meta({ readOnly: true }), {});
        assert.equal(tree.meta.readOnly, true);
    });
});
