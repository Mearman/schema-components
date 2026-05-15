/**
 * Tests for recursive schema rendering (z.lazy / $ref-to-root).
 *
 * Verifies that recursive schemas render correctly as nested fieldsets
 * rather than raw JSON strings, and that optional empty arrays are
 * suppressed in read-only mode.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";

// ---------------------------------------------------------------------------
// Recursive tree schema
// ---------------------------------------------------------------------------

function makeTreeSchema() {
    const treeSchema: z.ZodType = z.object({
        label: z.string().meta({ description: "Label" }),
        children: z
            .array(z.lazy(() => treeSchema))
            .optional()
            .meta({ description: "Children" }),
    });
    return treeSchema;
}

const treeData = {
    label: "Root",
    children: [
        {
            label: "Branch A",
            children: [{ label: "Leaf A1" }, { label: "Leaf A2" }],
        },
        {
            label: "Branch B",
            children: [{ label: "Leaf B1" }],
        },
    ],
};

// ---------------------------------------------------------------------------
// Read-only rendering
// ---------------------------------------------------------------------------

describe("recursive — read-only", () => {
    it("renders nested fieldsets, not raw JSON", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: makeTreeSchema(),
                value: treeData,
                readOnly: true,
            })
        );

        // Branch A and Branch B should appear as rendered text, not JSON
        expect(html).toContain("Branch A");
        expect(html).toContain("Branch B");
        expect(html).not.toContain('{"label"');
    });

    it("renders leaf node labels", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: makeTreeSchema(),
                value: treeData,
                readOnly: true,
            })
        );

        expect(html).toContain("Leaf A1");
        expect(html).toContain("Leaf A2");
        expect(html).toContain("Leaf B1");
    });

    it("does not render empty Children sections for leaf nodes", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: makeTreeSchema(),
                value: treeData,
                readOnly: true,
            })
        );

        // Count fieldsets — one per node (Root, Branch A, Branch B,
        // Leaf A1, Leaf A2, Leaf B1 = 6)
        const fieldsetCount = (html.match(/<fieldset>/g) ?? []).length;
        expect(fieldsetCount).toBe(6);
    });
});

// ---------------------------------------------------------------------------
// Editable rendering
// ---------------------------------------------------------------------------

describe("recursive — editable", () => {
    it("renders input fields at every level", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: makeTreeSchema(),
                value: treeData,
            })
        );

        // All labels should be in input fields
        const inputCount = (html.match(/<input/g) ?? []).length;
        // Root + Branch A + Leaf A1 + Leaf A2 + Branch B + Leaf B1 = 6 inputs
        expect(inputCount).toBe(6);
        expect(html).toContain("Root");
        expect(html).toContain("Branch A");
        expect(html).toContain("Leaf A1");
    });

    it("does not render empty Children sections for leaf nodes", () => {
        const html = renderToString(
            createElement(SchemaComponent, {
                schema: makeTreeSchema(),
                value: treeData,
            })
        );

        // Leaf nodes should not have empty group divs or orphaned Children labels
        // Count fieldsets — one per node
        const fieldsetCount = (html.match(/<fieldset>/g) ?? []).length;
        expect(fieldsetCount).toBe(6);

        // No empty group divs
        const emptyGroups = html.match(/role="group"[^>]*><\/div>/g);
        expect(emptyGroups).toBeNull();
    });
});
