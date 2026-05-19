/** @jsxImportSource solid-js */
/**
 * Regression test for the Solid `<SchemaComponent>`'s `schemaRef` prop.
 *
 * Mirrors the React equivalent in `openapi30.unit.test.ts` (the
 * "renders the base schema as a WAI-ARIA tablist via <SchemaComponent>"
 * case): we hand the Solid adapter an OpenAPI document whose first
 * `components/schemas` entry is intentionally NOT the schema we want
 * rendered, and assert that pointing `schemaRef` at the canonical
 * `Pet` schema resolves to that sub-schema rather than falling back
 * to the first entry.
 *
 * Without per-framework coverage of this prop, an accidental revert
 * of the cross-framework `ref` → `schemaRef` rename would only be
 * caught by the React suite.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { SchemaComponent } from "../src/solid/SchemaComponent.tsx";

afterEach(() => {
    cleanup();
});

// Canonical OAS "Cat extends Pet" pattern matching `allOfCompositeDoc`
// in openapi30.unit.test.ts. The first entry under components/schemas
// is `Decoy` — the schemaRef default would resolve to that, so any
// assertion against `Pet`'s discriminated rendering proves the prop
// is doing real work.
const compositeDoc = {
    openapi: "3.1.0",
    info: { title: "Pets", version: "1.0" },
    paths: {},
    components: {
        schemas: {
            // Intentionally first — a single scalar string. If
            // `schemaRef` is ignored the renderer would emit a plain
            // text input rather than the Pet tablist.
            Decoy: {
                type: "object",
                properties: {
                    label: { type: "string" },
                },
            },
            Pet: {
                type: "object",
                discriminator: {
                    propertyName: "petType",
                    mapping: {
                        Dog: "#/components/schemas/Dog",
                        Cat: "#/components/schemas/Cat",
                    },
                },
                properties: {
                    petType: { type: "string" },
                    name: { type: "string" },
                },
                required: ["petType", "name"],
            },
            Dog: {
                allOf: [
                    { $ref: "#/components/schemas/Pet" },
                    {
                        type: "object",
                        properties: {
                            bark: { type: "boolean" },
                        },
                    },
                ],
            },
            Cat: {
                allOf: [
                    { $ref: "#/components/schemas/Pet" },
                    {
                        type: "object",
                        properties: {
                            hunts: { type: "boolean" },
                        },
                    },
                ],
            },
        },
    },
};

describe("Solid <SchemaComponent> — schemaRef resolves an OpenAPI sub-schema", () => {
    it("renders the referenced Pet schema as a discriminated-union tablist", () => {
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={compositeDoc}
                schemaRef="#/components/schemas/Pet"
                value={{ petType: "Dog", name: "Fido", bark: true }}
            />
        ));

        // The synthesised oneOf with per-option `const` discriminators
        // must produce a WAI-ARIA tablist — one tab per mapping entry.
        const tablist = container.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();

        const tabs = container.querySelectorAll('[role="tab"]');
        expect(tabs.length).toBe(2);

        const tabLabels = Array.from(tabs).map((tab) => tab.textContent);
        expect(tabLabels).toContain("Dog");
        expect(tabLabels).toContain("Cat");

        // Sanity check: the Decoy schema's `label` field must not
        // leak into the rendered output. If `schemaRef` were ignored
        // we would see `input#sc-root-label` from the first entry.
        const decoyInput = container.querySelector("input#sc-root-label");
        expect(decoyInput).toBeNull();
    });
});
