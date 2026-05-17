/**
 * Tests for the Draft 04 `id` → `$id` rewrite scope.
 *
 * The Draft 04 per-node transform rewrites a string-valued `id` keyword
 * at Schema Object positions to `$id`. The recursion in
 * `deepNormaliseWithContext` only descends into known sub-schema
 * locations (`properties`, `$defs`, `items`, `allOf`, …), so literal
 * `id` properties inside arbitrary JSON contexts such as `examples`,
 * `default` or `const` must survive untouched.
 */
import { describe, it, expect } from "vitest";
import { normaliseJsonSchema } from "../src/core/normalise.ts";
import { isObject } from "../src/core/guards.ts";

describe("Draft 04 id → $id rewrite scope", () => {
    it("leaves `id` inside an `examples` array unchanged", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                name: { type: "string" },
            },
            examples: [{ id: "X", name: "Ada" }],
        };
        const out = normaliseJsonSchema(schema, "draft-04");
        const examples: unknown = out.examples;
        if (!Array.isArray(examples)) {
            expect.unreachable("expected examples array");
            return;
        }
        const example: unknown = examples[0];
        if (!isObject(example)) {
            expect.unreachable("expected example object");
            return;
        }
        expect(example.id).toBe("X");
        expect("$id" in example).toBe(false);
    });

    it("leaves `id` inside a `default` value unchanged", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                row: { type: "object" },
            },
            default: { id: "default-id", row: {} },
        };
        const out = normaliseJsonSchema(schema, "draft-04");
        const defaultValue = out.default;
        if (!isObject(defaultValue)) {
            expect.unreachable("expected default object");
            return;
        }
        expect(defaultValue.id).toBe("default-id");
        expect("$id" in defaultValue).toBe(false);
    });

    it("leaves `id` inside a `const` value unchanged", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                row: { type: "object" },
            },
            const: { id: "const-id", row: {} },
        };
        const out = normaliseJsonSchema(schema, "draft-04");
        const constValue = out.const;
        if (!isObject(constValue)) {
            expect.unreachable("expected const object");
            return;
        }
        expect(constValue.id).toBe("const-id");
        expect("$id" in constValue).toBe(false);
    });

    it("still rewrites `id` at a real Schema Object position", () => {
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            id: "https://example.com/root",
            type: "object",
            properties: {
                inner: {
                    id: "https://example.com/inner",
                    type: "string",
                },
            },
        };
        const out = normaliseJsonSchema(schema, "draft-04");
        expect(out.$id).toBe("https://example.com/root");
        expect("id" in out).toBe(false);
        const props = out.properties;
        if (!isObject(props)) {
            expect.unreachable("expected properties");
            return;
        }
        const inner = props.inner;
        if (!isObject(inner)) {
            expect.unreachable("expected inner");
            return;
        }
        expect(inner.$id).toBe("https://example.com/inner");
        expect("id" in inner).toBe(false);
    });

    it("leaves `id` properties declared via `properties.id` schemas untouched", () => {
        // `properties.id` is a child Schema Object — `id` here is the
        // PROPERTY NAME being declared, not a value inside the parent's
        // own Schema Object. The rewrite must not touch the property-
        // name string itself.
        const schema = {
            $schema: "http://json-schema.org/draft-04/schema#",
            type: "object",
            properties: {
                id: { type: "string" },
                name: { type: "string" },
            },
        };
        const out = normaliseJsonSchema(schema, "draft-04");
        const props = out.properties;
        if (!isObject(props)) {
            expect.unreachable("expected properties");
            return;
        }
        // The property NAMED "id" is still in `properties`.
        expect(props.id).toBeDefined();
        expect(isObject(props.id) && props.id.type === "string").toBe(true);
    });
});
