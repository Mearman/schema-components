/**
 * Unit tests for resolveEditability and the JSON Schema walker.
 *
 * Tests the three-source editability resolution (property, component, root)
 * and the walker's handling of JSON Schema types, objects, arrays, unions,
 * field overrides, nested overrides, and readOnly/writeOnly propagation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEditability } from "../src/core/types.ts";
import { walk } from "../src/core/walker.ts";
import type { WalkedField } from "../src/core/types.ts";

// Helper: non-null field access for tests.
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
// Walker — basic JSON Schema types
// ---------------------------------------------------------------------------

describe("walk — basic types", () => {
    it("walks a string field", () => {
        const tree = walk({ type: "string" }, {});
        assert.equal(tree.type, "string");
        assert.equal(tree.editability, "editable");
    });

    it("walks a number field", () => {
        const tree = walk({ type: "number" }, {});
        assert.equal(tree.type, "number");
    });

    it("walks a boolean field", () => {
        const tree = walk({ type: "boolean" }, {});
        assert.equal(tree.type, "boolean");
    });

    it("walks an enum", () => {
        const tree = walk({ enum: ["admin", "editor", "viewer"] }, {});
        assert.equal(tree.type, "enum");
        assert.deepEqual(tree.enumValues, ["admin", "editor", "viewer"]);
    });

    it("walks a literal (const)", () => {
        const tree = walk({ const: "active" }, {});
        assert.equal(tree.type, "literal");
        assert.deepEqual(tree.literalValues, ["active"]);
    });

    it("returns unknown for non-object input", () => {
        const tree = walk("not a schema", {});
        assert.equal(tree.type, "unknown");
    });
});

// ---------------------------------------------------------------------------
// Walker — object fields
// ---------------------------------------------------------------------------

describe("walk — objects", () => {
    const schema = {
        type: "object",
        properties: {
            name: { type: "string" },
            age: { type: "number" },
        },
        required: ["name"],
    };

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

    it("marks required fields as not optional", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "name").isOptional, false);
    });

    it("marks non-required fields as optional", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "age").isOptional, true);
    });
});

// ---------------------------------------------------------------------------
// Walker — nested objects
// ---------------------------------------------------------------------------

describe("walk — nested objects", () => {
    const schema = {
        type: "object",
        properties: {
            name: { type: "string" },
            address: {
                type: "object",
                properties: {
                    street: { type: "string" },
                    city: { type: "string" },
                    postcode: { type: "string" },
                },
                required: ["street", "city"],
            },
        },
        required: ["name"],
    };

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
    const schema = {
        type: "object",
        properties: {
            id: { type: "string", readOnly: true },
            name: { type: "string" },
            password: { type: "string", writeOnly: true },
        },
        required: ["id", "name"],
    };

    it("defaults to editable", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "name").editability, "editable");
    });

    it("readOnly on property makes field presentation", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "id").editability, "presentation");
    });

    it("writeOnly on property makes field input", () => {
        const tree = walk(schema, {});
        assert.equal(getField(tree, "password").editability, "input");
    });

    it("component readOnly makes all fields presentation", () => {
        const schema2 = {
            type: "object",
            properties: {
                id: { type: "string" },
                name: { type: "string" },
            },
            required: ["id"],
        };
        const tree = walk(schema2, { componentMeta: { readOnly: true } });
        assert.equal(getField(tree, "id").editability, "presentation");
        assert.equal(getField(tree, "name").editability, "presentation");
    });

    it("root readOnly makes all fields presentation", () => {
        const schema2 = {
            type: "object",
            properties: {
                id: { type: "string" },
                name: { type: "string" },
            },
            required: ["id"],
        };
        const tree = walk(schema2, { rootMeta: { readOnly: true } });
        assert.equal(getField(tree, "id").editability, "presentation");
    });
});

// ---------------------------------------------------------------------------
// Walker — field overrides
// ---------------------------------------------------------------------------

describe("walk — field overrides", () => {
    const schema = {
        type: "object",
        properties: {
            name: { type: "string" },
            age: { type: "number" },
            address: {
                type: "object",
                properties: {
                    street: { type: "string" },
                    city: { type: "string" },
                },
                required: ["street"],
            },
        },
        required: ["name"],
    };

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
    it("extracts string constraints (minLength, maxLength)", () => {
        const tree = walk({ type: "string", minLength: 1, maxLength: 100 }, {});
        assert.equal(tree.constraints.minLength, 1);
        assert.equal(tree.constraints.maxLength, 100);
    });

    it("extracts number constraints (minimum, maximum)", () => {
        const tree = walk({ type: "number", minimum: 0, maximum: 150 }, {});
        assert.equal(tree.constraints.minimum, 0);
        assert.equal(tree.constraints.maximum, 150);
    });

    it("extracts email format", () => {
        const tree = walk({ type: "string", format: "email" }, {});
        assert.equal(tree.constraints.format, "email");
    });

    it("extracts url format", () => {
        const tree = walk({ type: "string", format: "uri" }, {});
        assert.equal(tree.constraints.format, "uri");
    });
});

// ---------------------------------------------------------------------------
// Walker — nullable (anyOf [T, null])
// ---------------------------------------------------------------------------

describe("walk — nullable", () => {
    it("detects nullable from anyOf [T, null]", () => {
        const tree = walk(
            { anyOf: [{ type: "string" }, { type: "null" }] },
            {}
        );
        assert.equal(tree.type, "string");
        assert.equal(tree.isNullable, true);
    });
});

// ---------------------------------------------------------------------------
// Walker — arrays
// ---------------------------------------------------------------------------

describe("walk — arrays", () => {
    it("walks an array with items schema", () => {
        const tree = walk({ type: "array", items: { type: "string" } }, {});
        assert.equal(tree.type, "array");
        assert.ok(tree.element);
        assert.equal(tree.element.type, "string");
    });

    it("walks an array of objects", () => {
        const tree = walk(
            {
                type: "array",
                items: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                },
            },
            {}
        );
        assert.equal(tree.type, "array");
        assert.ok(tree.element);
        assert.equal(tree.element.type, "object");
        assert.ok(tree.element.fields);
        assert.ok("name" in tree.element.fields);
    });
});

// ---------------------------------------------------------------------------
// Walker — unions (oneOf, anyOf)
// ---------------------------------------------------------------------------

describe("walk — unions", () => {
    it("walks a oneOf union", () => {
        const tree = walk(
            { oneOf: [{ type: "string" }, { type: "number" }] },
            {}
        );
        assert.equal(tree.type, "union");
        assert.equal(tree.options?.length, 2);
    });

    it("walks a discriminated union (oneOf with const)", () => {
        const tree = walk(
            {
                oneOf: [
                    {
                        type: "object",
                        properties: {
                            type: { const: "a" },
                            value: { type: "string" },
                        },
                        required: ["type", "value"],
                    },
                    {
                        type: "object",
                        properties: {
                            type: { const: "b" },
                            count: { type: "number" },
                        },
                        required: ["type", "count"],
                    },
                ],
            },
            {}
        );
        assert.equal(tree.type, "discriminatedUnion");
        assert.equal(tree.discriminator, "type");
    });
});

// ---------------------------------------------------------------------------
// Walker — allOf merging
// ---------------------------------------------------------------------------

describe("walk — allOf", () => {
    it("merges properties from allOf", () => {
        const tree = walk(
            {
                allOf: [
                    {
                        type: "object",
                        properties: { name: { type: "string" } },
                        required: ["name"],
                    },
                    {
                        type: "object",
                        properties: { age: { type: "number" } },
                        required: ["age"],
                    },
                ],
            },
            {}
        );
        assert.equal(tree.type, "object");
        assert.ok(tree.fields);
        assert.ok("name" in tree.fields);
        assert.ok("age" in tree.fields);
    });
});

// ---------------------------------------------------------------------------
// Walker — meta extraction
// ---------------------------------------------------------------------------

describe("walk — meta", () => {
    it("extracts description from JSON Schema", () => {
        const tree = walk({ type: "string", description: "Full name" }, {});
        assert.equal(tree.meta.description, "Full name");
    });

    it("extracts custom meta (component hint)", () => {
        const tree = walk(
            { type: "string", description: "Email", component: "text" },
            {}
        );
        assert.equal(tree.meta.description, "Email");
        assert.equal(tree.meta.component, "text");
    });

    it("extracts readOnly from JSON Schema", () => {
        const tree = walk({ type: "string", readOnly: true }, {});
        assert.equal(tree.meta.readOnly, true);
    });

    it("extracts writeOnly from JSON Schema", () => {
        const tree = walk({ type: "string", writeOnly: true }, {});
        assert.equal(tree.meta.writeOnly, true);
    });
});

// ---------------------------------------------------------------------------
// Walker — $ref resolution
// ---------------------------------------------------------------------------

describe("walk — $ref resolution", () => {
    it("resolves $ref within root document", () => {
        const rootDocument = {
            type: "object",
            properties: {
                user: { $ref: "#/$defs/User" },
            },
            required: ["user"],
            $defs: {
                User: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                    },
                    required: ["name"],
                },
            },
        };
        const tree = walk(rootDocument, { rootDocument });
        assert.equal(tree.type, "object");
        const user = getField(tree, "user");
        assert.equal(user.type, "object");
        assert.equal(getField(user, "name").type, "string");
    });
});

// ---------------------------------------------------------------------------
// Walker — record (additionalProperties)
// ---------------------------------------------------------------------------

describe("walk — record", () => {
    it("walks an object with additionalProperties as a record", () => {
        const tree = walk(
            {
                type: "object",
                additionalProperties: { type: "number" },
            },
            {}
        );
        assert.equal(tree.type, "record");
        assert.ok(tree.valueType);
        assert.equal(tree.valueType.type, "number");
    });
});
