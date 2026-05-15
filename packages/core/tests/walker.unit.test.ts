import {
    fieldsOf,
    optionsOf,
    literalValuesOf,
    numberConstraintsOf,
    elementOf,
    enumValuesOf,
    stringConstraintsOf,
    discriminatorOf,
    valueTypeOf,
} from "./helpers.js";
/**
 * Unit tests for resolveEditability and the JSON Schema walker.
 *
 * Tests the three-source editability resolution (property, component, root)
 * and the walker's handling of JSON Schema types, objects, arrays, unions,
 * field overrides, nested overrides, and readOnly/writeOnly propagation.
 */

import { describe, it, expect } from "vitest";
import { resolveEditability } from "../src/core/types.ts";
import { walk } from "../src/core/walker.ts";
import { assertDefined, getField } from "./helpers.ts";

// ---------------------------------------------------------------------------
// resolveEditability
// ---------------------------------------------------------------------------

describe("resolveEditability", () => {
    it("returns editable when no meta is set", () => {
        expect(resolveEditability(undefined, undefined, undefined)).toBe(
            "editable"
        );
    });

    it("returns presentation for property-level readOnly: true", () => {
        expect(
            resolveEditability({ readOnly: true }, undefined, undefined)
        ).toBe("presentation");
    });

    it("returns input for property-level writeOnly: true", () => {
        expect(
            resolveEditability({ writeOnly: true }, undefined, undefined)
        ).toBe("input");
    });

    it("readOnly takes priority over writeOnly at the same level", () => {
        expect(
            resolveEditability(
                { readOnly: true, writeOnly: true },
                undefined,
                undefined
            )
        ).toBe("presentation");
    });

    it("property-level overrides component-level", () => {
        expect(
            resolveEditability(
                { readOnly: true },
                { readOnly: false },
                undefined
            )
        ).toBe("presentation");
    });

    it("component-level is used when property has no override", () => {
        expect(
            resolveEditability(undefined, { readOnly: true }, undefined)
        ).toBe("presentation");
    });

    it("root-level is used when property and component have no override", () => {
        expect(
            resolveEditability(undefined, undefined, { readOnly: true })
        ).toBe("presentation");
    });

    it("property-level overrides root-level", () => {
        expect(
            resolveEditability({ writeOnly: true }, undefined, {
                readOnly: true,
            })
        ).toBe("input");
    });

    it("readOnly: false at property level overrides component readOnly: true", () => {
        expect(
            resolveEditability(
                { readOnly: false },
                { readOnly: true },
                undefined
            )
        ).toBe("editable");
    });

    it("writeOnly: false at property level overrides component writeOnly: true", () => {
        expect(
            resolveEditability(
                { writeOnly: false },
                { writeOnly: true },
                undefined
            )
        ).toBe("editable");
    });

    it("readOnly: false at property level overrides root readOnly: true", () => {
        expect(
            resolveEditability({ readOnly: false }, undefined, {
                readOnly: true,
            })
        ).toBe("editable");
    });

    it("readOnly: false without any higher-level override is just editable", () => {
        expect(
            resolveEditability({ readOnly: false }, undefined, undefined)
        ).toBe("editable");
    });

    it("writeOnly: true takes priority when readOnly: false is also set", () => {
        expect(
            resolveEditability(
                { readOnly: false, writeOnly: true },
                undefined,
                undefined
            )
        ).toBe("input");
    });
});

// ---------------------------------------------------------------------------
// Walker — basic JSON Schema types
// ---------------------------------------------------------------------------

describe("walk — basic types", () => {
    it("walks a string field", () => {
        const tree = walk({ type: "string" }, {});
        expect(tree.type).toBe("string");
        expect(tree.editability).toBe("editable");
    });

    it("walks a number field", () => {
        const tree = walk({ type: "number" }, {});
        expect(tree.type).toBe("number");
    });

    it("walks a boolean field", () => {
        const tree = walk({ type: "boolean" }, {});
        expect(tree.type).toBe("boolean");
    });

    it("walks an enum", () => {
        const tree = walk({ enum: ["admin", "editor", "viewer"] }, {});
        expect(tree.type).toBe("enum");
        expect(enumValuesOf(tree)).toStrictEqual(["admin", "editor", "viewer"]);
    });

    it("walks a literal (const)", () => {
        const tree = walk({ const: "active" }, {});
        expect(tree.type).toBe("literal");
        expect(literalValuesOf(tree)).toStrictEqual(["active"]);
    });

    it("returns unknown for non-object input", () => {
        const tree = walk("not a schema", {});
        expect(tree.type).toBe("unknown");
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
        expect(tree.type).toBe("object");
        expect(fieldsOf(tree)).toBeTruthy();
        expect(
            "name" in assertDefined(fieldsOf(tree), "expected fields")
        ).toBeTruthy();
        expect(
            "age" in assertDefined(fieldsOf(tree), "expected fields")
        ).toBeTruthy();
    });

    it("infers string type for name field", () => {
        const tree = walk(schema, {});
        expect(getField(tree, "name").type).toBe("string");
    });

    it("infers number type for age field", () => {
        const tree = walk(schema, {});
        expect(getField(tree, "age").type).toBe("number");
    });

    it("marks required fields as not optional", () => {
        const tree = walk(schema, {});
        expect(getField(tree, "name").isOptional).toBe(false);
    });

    it("marks non-required fields as optional", () => {
        const tree = walk(schema, {});
        expect(getField(tree, "age").isOptional).toBe(true);
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
        expect(address.type).toBe("object");
        expect(getField(tree, "address", "street").type).toBe("string");
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
        expect(getField(tree, "name").editability).toBe("editable");
    });

    it("readOnly on property makes field presentation", () => {
        const tree = walk(schema, {});
        expect(getField(tree, "id").editability).toBe("presentation");
    });

    it("writeOnly on property makes field input", () => {
        const tree = walk(schema, {});
        expect(getField(tree, "password").editability).toBe("input");
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
        expect(getField(tree, "id").editability).toBe("presentation");
        expect(getField(tree, "name").editability).toBe("presentation");
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
        expect(getField(tree, "id").editability).toBe("presentation");
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
        expect(getField(tree, "name").editability).toBe("presentation");
        expect(getField(tree, "age").editability).toBe("editable");
    });

    it("applies nested field override", () => {
        const tree = walk(schema, {
            fieldOverrides: { address: { city: { readOnly: true } } },
        });
        expect(getField(tree, "address", "city").editability).toBe(
            "presentation"
        );
        expect(getField(tree, "address", "street").editability).toBe(
            "editable"
        );
    });

    it("meta fields on an object override are extracted", () => {
        const tree = walk(schema, {
            fieldOverrides: {
                address: { description: "Home", readOnly: true },
            },
        });
        expect(getField(tree, "address").editability).toBe("presentation");
        expect(getField(tree, "address").meta.description).toBe("Home");
    });

    it("readOnly: false overrides component readOnly for the subtree", () => {
        const tree = walk(schema, {
            componentMeta: { readOnly: true },
            fieldOverrides: { address: { readOnly: false } },
        });
        expect(getField(tree, "address").editability).toBe("editable");
        expect(getField(tree, "address", "street").editability).toBe(
            "editable"
        );
        expect(getField(tree, "address", "city").editability).toBe("editable");
        expect(getField(tree, "name").editability).toBe("presentation");
    });

    it("readOnly: true on nested child overrides parent readOnly: false", () => {
        const tree = walk(schema, {
            componentMeta: { readOnly: true },
            fieldOverrides: {
                address: { readOnly: false, city: { readOnly: true } },
            },
        });
        expect(getField(tree, "address").editability).toBe("editable");
        expect(getField(tree, "address", "street").editability).toBe(
            "editable"
        );
        expect(getField(tree, "address", "city").editability).toBe(
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
        expect(stringConstraintsOf(tree)?.minLength).toBe(1);
        expect(stringConstraintsOf(tree)?.maxLength).toBe(100);
    });

    it("extracts number constraints (minimum, maximum)", () => {
        const tree = walk({ type: "number", minimum: 0, maximum: 150 }, {});
        expect(numberConstraintsOf(tree)?.minimum).toBe(0);
        expect(numberConstraintsOf(tree)?.maximum).toBe(150);
    });

    it("extracts email format", () => {
        const tree = walk({ type: "string", format: "email" }, {});
        expect(stringConstraintsOf(tree)?.format).toBe("email");
    });

    it("extracts url format", () => {
        const tree = walk({ type: "string", format: "uri" }, {});
        expect(stringConstraintsOf(tree)?.format).toBe("uri");
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
        expect(tree.type).toBe("string");
        expect(tree.isNullable).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Walker — arrays
// ---------------------------------------------------------------------------

describe("walk — arrays", () => {
    it("walks an array with items schema", () => {
        const tree = walk({ type: "array", items: { type: "string" } }, {});
        expect(tree.type).toBe("array");
        expect(elementOf(tree)).toBeTruthy();
        expect(assertDefined(elementOf(tree), "expected element").type).toBe(
            "string"
        );
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
        expect(tree.type).toBe("array");
        expect(elementOf(tree)).toBeTruthy();
        const element = assertDefined(elementOf(tree), "expected element");
        expect(element.type).toBe("object");
        expect(fieldsOf(element)).toBeTruthy();
        expect(
            "name" in assertDefined(fieldsOf(element), "fields")
        ).toBeTruthy();
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
        expect(tree.type).toBe("union");
        expect(optionsOf(tree)?.length).toBe(2);
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
        expect(tree.type).toBe("discriminatedUnion");
        expect(discriminatorOf(tree)).toBe("type");
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
        expect(tree.type).toBe("object");
        expect(fieldsOf(tree)).toBeTruthy();
        expect(
            "name" in assertDefined(fieldsOf(tree), "expected fields")
        ).toBeTruthy();
        expect(
            "age" in assertDefined(fieldsOf(tree), "expected fields")
        ).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Walker — meta extraction
// ---------------------------------------------------------------------------

describe("walk — meta", () => {
    it("extracts description from JSON Schema", () => {
        const tree = walk({ type: "string", description: "Full name" }, {});
        expect(tree.meta.description).toBe("Full name");
    });

    it("extracts custom meta (component hint)", () => {
        const tree = walk(
            { type: "string", description: "Email", component: "text" },
            {}
        );
        expect(tree.meta.description).toBe("Email");
        expect(tree.meta.component).toBe("text");
    });

    it("extracts readOnly from JSON Schema", () => {
        const tree = walk({ type: "string", readOnly: true }, {});
        expect(tree.meta.readOnly).toBe(true);
    });

    it("extracts writeOnly from JSON Schema", () => {
        const tree = walk({ type: "string", writeOnly: true }, {});
        expect(tree.meta.writeOnly).toBe(true);
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
        expect(tree.type).toBe("object");
        const user = getField(tree, "user");
        expect(user.type).toBe("object");
        expect(getField(user, "name").type).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// Walker — record (additionalProperties)
// ---------------------------------------------------------------------------

describe("walk — recursive ($ref to root)", () => {
    const treeSchema = {
        type: "object",
        properties: {
            label: { type: "string", description: "Label" },
            children: {
                type: "array",
                items: { $ref: "#" },
                description: "Children",
            },
        },
        required: ["label"],
    } as Record<string, unknown>;

    it("resolves $ref '#' to the root document", () => {
        const tree = walk(treeSchema, { rootDocument: treeSchema });
        const children = getField(tree, "children");
        const element = assertDefined(elementOf(children), "expected element");
        expect(element.type).toBe("object");
    });

    it("walks recursive element fields correctly", () => {
        const tree = walk(treeSchema, { rootDocument: treeSchema });
        const element = assertDefined(
            elementOf(getField(tree, "children")),
            "expected element"
        );
        expect(fieldsOf(element)).toBeTruthy();
        expect("label" in assertDefined(fieldsOf(element), "fields")).toBe(
            true
        );
        expect("children" in assertDefined(fieldsOf(element), "fields")).toBe(
            true
        );
    });

    it("propagates readOnly to recursive element", () => {
        const tree = walk(treeSchema, {
            rootDocument: treeSchema,
            componentMeta: { readOnly: true },
        });
        const element = assertDefined(
            elementOf(getField(tree, "children")),
            "expected element"
        );
        expect(element.editability).toBe("presentation");
        expect(getField(element, "label").editability).toBe("presentation");
    });

    it("terminates: recursive element creates a proper graph cycle", () => {
        const tree = walk(treeSchema, { rootDocument: treeSchema });
        const element = assertDefined(
            elementOf(getField(tree, "children")),
            "expected element"
        );
        // One level of recursion should resolve correctly
        expect(element.type).toBe("object");
        // The children element inside the recursive element should also resolve
        const nestedChildren = getField(element, "children");
        expect(nestedChildren.type).toBe("array");
        // The nested element should be the SAME object reference (graph cycle)
        const nestedElement = assertDefined(
            elementOf(nestedChildren),
            "expected nested element"
        );
        expect(nestedElement).toBe(element); // same reference = cycle
        expect(nestedElement.type).toBe("object");
        // Fields should be present at every depth
        expect(
            "label" in assertDefined(fieldsOf(nestedElement), "fields")
        ).toBe(true);
    });
});

describe("walk — record", () => {
    it("walks an object with additionalProperties as a record", () => {
        const tree = walk(
            {
                type: "object",
                additionalProperties: { type: "number" },
            },
            {}
        );
        expect(tree.type).toBe("record");
        expect(valueTypeOf(tree)).toBeTruthy();
        expect(
            assertDefined(valueTypeOf(tree), "expected valueType").type
        ).toBe("number");
    });
});
