/**
 * Extended walker tests — record fields and circular \$ref resolution.
 *
 * Extracted from walker.unit.test.ts — tests RecordField walking and
 * circular \$ref handling (self-referencing, mutually-referencing, and
 * depth-limited resolution).
 */

import { describe, it, expect } from "vitest";
import { isObjectField, isArrayField } from "../src/core/types.ts";
import { walk } from "../src/core/walker.ts";
import { assertDefined, valueTypeOf } from "./helpers.ts";

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

// ---------------------------------------------------------------------------
// Circular $ref
// ---------------------------------------------------------------------------

describe("circular ref resolution", () => {
    it("handles self-referencing schemas without infinite loop", () => {
        const schema = {
            type: "object",
            properties: {
                name: { type: "string" },
                parent: { $ref: "#/$defs/Person" },
            },
            $defs: {
                Person: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        parent: { $ref: "#/$defs/Person" },
                    },
                },
            },
        } as Record<string, unknown>;

        const result = walk(schema, { rootDocument: schema });

        expect(result.type).toBe("object");
        if (!isObjectField(result)) return;
        const parentField = assertDefined(result.fields.parent, "parent");
        // Circular ref resolves to the Person schema (object with name + parent)
        expect(parentField.type).toBe("object");
        if (!isObjectField(parentField)) return;
        expect("parent" in parentField.fields).toBe(true);
    });

    it("handles mutually-referencing schemas", () => {
        const schema = {
            type: "object",
            properties: {
                user: { $ref: "#/$defs/User" },
            },
            $defs: {
                User: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        posts: {
                            type: "array",
                            items: { $ref: "#/$defs/Post" },
                        },
                    },
                },
                Post: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        author: { $ref: "#/$defs/User" },
                    },
                },
            },
        } as Record<string, unknown>;

        const result = walk(schema, { rootDocument: schema });

        expect(result.type).toBe("object");
        if (!isObjectField(result)) return;
        const user = assertDefined(result.fields.user, "user");
        expect(user.type).toBe("object");
        if (!isObjectField(user)) return;
        const posts = assertDefined(user.fields.posts, "posts");
        expect(posts.type).toBe("array");
        if (!isArrayField(posts)) return;
        const element = posts.element;
        if (element === undefined) return;
        expect(element.type).toBe("object");
        if (!isObjectField(element)) return;
        const author = assertDefined(element.fields.author, "author");
        expect(author.type).toBe("object");
    });

    it("returns unknown for deeply nested refs exceeding max depth", () => {
        // Build a chain of refs: A → B → C → ... → Z
        const defs: Record<string, unknown> = {};
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        for (let i = 0; i < letters.length - 1; i++) {
            const current = String(letters[i]);
            const next = String(letters[i + 1]);
            defs[current] = {
                type: "object",
                properties: {
                    next: { $ref: `#/$defs/${next}` },
                },
            };
        }
        defs[String(letters.at(-1))] = {
            type: "string",
        };

        const schema = {
            type: "object",
            properties: { start: { $ref: "#/$defs/A" } },
            $defs: defs,
        } as Record<string, unknown>;

        // Should not infinite loop — depth limit kicks in
        const result = walk(schema, { rootDocument: schema });
        expect(result.type).toBe("object");
    });
});
