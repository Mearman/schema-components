/**
 * Tests for $ref annotation sibling merging per Draft 2020-12.
 *
 * Verifies that annotation keywords (title, description, examples, etc.)
 * appearing alongside $ref are merged over the resolved target's
 * annotations. The referencer wins for annotations.
 */

import { describe, it, expect } from "vitest";
import { mergeRefSiblings, ANNOTATION_SIBLINGS } from "../src/core/merge.ts";
import { walk } from "../src/core/walker.ts";

// ---------------------------------------------------------------------------
// mergeRefSiblings unit tests
// ---------------------------------------------------------------------------

describe("mergeRefSiblings", () => {
    it("overrides description from referencer", () => {
        const merged = mergeRefSiblings(
            { $ref: "#/defs/A", description: "overridden" },
            { description: "original", title: "A" }
        );
        expect(merged.description).toBe("overridden");
        expect(merged.title).toBe("A");
    });

    it("adds annotations not present on resolved target", () => {
        const merged = mergeRefSiblings(
            { $ref: "#/defs/A", deprecated: true },
            { description: "original" }
        );
        expect(merged.deprecated).toBe(true);
        expect(merged.description).toBe("original");
    });

    it("does not merge structural keywords", () => {
        const merged = mergeRefSiblings(
            { $ref: "#/defs/A", type: "string", properties: {} },
            { description: "original" }
        );
        expect("type" in merged).toBe(false);
        expect("properties" in merged).toBe(false);
    });

    it("returns resolved meta when referencer has no siblings", () => {
        const merged = mergeRefSiblings(
            { $ref: "#/defs/A" },
            { description: "original" }
        );
        expect(merged.description).toBe("original");
    });
});

// ---------------------------------------------------------------------------
// ANNOTATION_SIBLINGS set
// ---------------------------------------------------------------------------

describe("ANNOTATION_SIBLINGS", () => {
    it("includes standard annotation keywords", () => {
        expect(ANNOTATION_SIBLINGS.has("title")).toBe(true);
        expect(ANNOTATION_SIBLINGS.has("description")).toBe(true);
        expect(ANNOTATION_SIBLINGS.has("default")).toBe(true);
        expect(ANNOTATION_SIBLINGS.has("examples")).toBe(true);
        expect(ANNOTATION_SIBLINGS.has("deprecated")).toBe(true);
        expect(ANNOTATION_SIBLINGS.has("readOnly")).toBe(true);
        expect(ANNOTATION_SIBLINGS.has("writeOnly")).toBe(true);
        expect(ANNOTATION_SIBLINGS.has("$comment")).toBe(true);
    });

    it("does not include structural keywords", () => {
        expect(ANNOTATION_SIBLINGS.has("type")).toBe(false);
        expect(ANNOTATION_SIBLINGS.has("properties")).toBe(false);
        expect(ANNOTATION_SIBLINGS.has("items")).toBe(false);
        expect(ANNOTATION_SIBLINGS.has("required")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Walker integration
// ---------------------------------------------------------------------------

describe("walker $ref sibling merge", () => {
    it("merges description from $ref sibling", () => {
        const schema = {
            type: "object",
            properties: {
                user: {
                    $ref: "#/$defs/User",
                    description: "The current user",
                },
            },
            $defs: {
                User: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                    },
                    description: "A user object",
                },
            },
        };

        const tree = walk(schema, { rootDocument: schema });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;

        const user = tree.fields.user;
        expect(user).toBeDefined();
        if (user === undefined) return;

        // Referencer's description wins
        expect(user.meta.description).toBe("The current user");
        expect(user.type).toBe("object");
    });

    it("merges deprecated from $ref sibling", () => {
        const schema = {
            type: "object",
            properties: {
                old: {
                    $ref: "#/$defs/Legacy",
                    deprecated: true,
                },
            },
            $defs: {
                Legacy: {
                    type: "string",
                    description: "A legacy field",
                },
            },
        };

        const tree = walk(schema, { rootDocument: schema });
        expect(tree.type).toBe("object");
        if (tree.type !== "object") return;

        const old = tree.fields.old;
        expect(old).toBeDefined();
        if (old === undefined) return;

        expect(old.meta.deprecated).toBe(true);
        expect(old.meta.description).toBe("A legacy field");
    });
});
