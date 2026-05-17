/**
 * Issue 11 — extractRootMetaFromJson must surface `examples` and
 * `default` from the JSON Schema root into the `rootMeta` shape.
 *
 * `SchemaMeta` carries arbitrary keys through its index signature, so
 * `examples` and `default` ride on that path rather than as named
 * fields. The tests below pin the field names so refactors cannot
 * silently rename or drop them.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { normaliseSchema } from "../src/core/adapter.ts";

describe("extractRootMetaFromJson — examples (issue 11)", () => {
    it("surfaces a JSON-Schema-level examples array on rootMeta.examples", () => {
        const jsonSchema = {
            type: "object" as const,
            examples: [{ name: "Ada" }, { name: "Grace" }],
            properties: { name: { type: "string" as const } },
        };
        const result = normaliseSchema(jsonSchema);
        expect(result.rootMeta?.examples).toStrictEqual([
            { name: "Ada" },
            { name: "Grace" },
        ]);
    });

    it("ignores examples when present as a non-array value", () => {
        // A non-array `examples` is invalid per Draft 2020-12 and we
        // must not promote it; otherwise downstream consumers would
        // see a malformed shape.
        const jsonSchema = {
            type: "object" as const,
            examples: "not-an-array",
            properties: { name: { type: "string" as const } },
        };
        const result = normaliseSchema(jsonSchema);
        expect(result.rootMeta?.examples).toBeUndefined();
    });

    it("surfaces examples extracted from a Zod schema's JSON Schema output", () => {
        // Zod's .meta({ examples: [...] }) propagates examples into the
        // generated JSON Schema. The adapter must lift them onto
        // rootMeta the same way it would for a hand-written schema.
        const schema = z
            .object({ name: z.string() })
            .meta({ examples: [{ name: "Ada" }] });
        const result = normaliseSchema(schema);
        expect(result.rootMeta?.examples).toStrictEqual([{ name: "Ada" }]);
    });
});

describe("extractRootMetaFromJson — default (issue 11)", () => {
    it("surfaces a JSON-Schema-level default on rootMeta.default", () => {
        const jsonSchema = {
            type: "string" as const,
            default: "hello",
        };
        const result = normaliseSchema(jsonSchema);
        expect(result.rootMeta?.default).toBe("hello");
    });

    it("preserves a falsy default value (false) — must not drop it as falsy", () => {
        const jsonSchema = {
            type: "boolean" as const,
            default: false,
        };
        const result = normaliseSchema(jsonSchema);
        // The presence check uses `in`, so `false` is retained.
        expect(result.rootMeta?.default).toBe(false);
    });

    it("preserves a null default value — must not drop it as nullish", () => {
        const jsonSchema = {
            type: "null" as const,
            default: null,
        };
        const result = normaliseSchema(jsonSchema);
        expect(result.rootMeta?.default).toBe(null);
    });

    it("omits default from rootMeta when the schema declares no default", () => {
        const jsonSchema = {
            type: "string" as const,
        };
        const result = normaliseSchema(jsonSchema);
        // rootMeta is undefined for a schema with no extractable meta;
        // either way `default` must not appear.
        if (result.rootMeta !== undefined) {
            expect("default" in result.rootMeta).toBe(false);
        }
    });
});

describe("extractRootMetaFromJson — combined fields", () => {
    it("surfaces title, description, readOnly, examples, and default together", () => {
        const jsonSchema = {
            type: "object" as const,
            title: "User",
            description: "An application user",
            readOnly: true,
            examples: [{ id: 1 }],
            default: { id: 0 },
            properties: { id: { type: "integer" as const } },
        };
        const result = normaliseSchema(jsonSchema);
        expect(result.rootMeta).toBeDefined();
        if (result.rootMeta !== undefined) {
            expect(result.rootMeta.title).toBe("User");
            expect(result.rootMeta.description).toBe("An application user");
            expect(result.rootMeta.readOnly).toBe(true);
            expect(result.rootMeta.examples).toStrictEqual([{ id: 1 }]);
            expect(result.rootMeta.default).toStrictEqual({ id: 0 });
        }
    });
});
