/**
 * Regression test for the Svelte `<SchemaComponent>` `schemaRef` prop.
 *
 * Mirrors the React pattern in `tests/openapi30.unit.test.ts` (lines
 * 885-908). Without this test, a future revert of the `schemaRef`
 * rename in the Svelte adapter would only be caught by the React
 * suite.
 *
 * The test mounts `<SchemaComponent>` with an OpenAPI 3.1 document and
 * a `schemaRef` pointing at a specific operation. The rendered output
 * must reflect the resolved sub-schema (e.g. its discriminated-union
 * WAI-ARIA tablist), not the first schema in `components/schemas` —
 * which is what would surface if the prop were silently dropped.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import SchemaComponent from "../../src/svelte/SchemaComponent.svelte";

afterEach(() => {
    cleanup();
});

// Canonical "Cat extends Pet" OpenAPI 3.1 fixture — mirrors the
// `allOfCompositeDoc` used in `openapi30.unit.test.ts`. The base
// `Pet` schema carries the discriminator and each subtype lists
// `Pet` under its `allOf`. After normalisation, the walker turns
// this into a discriminated union whose headless renderer emits
// a WAI-ARIA tablist.
const allOfCompositeDoc = {
    openapi: "3.1.0",
    info: { title: "Pets", version: "1.0" },
    paths: {},
    components: {
        schemas: {
            // `Decoy` is listed first so the test fails loudly if the
            // `schemaRef` prop is silently dropped — without the ref,
            // `<SchemaComponent>` would render the first schema in
            // `components/schemas`, which has no discriminator and
            // therefore no tablist.
            Decoy: {
                type: "object",
                properties: {
                    placeholder: { type: "string" },
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

describe("<SchemaComponent> schemaRef prop", () => {
    it("resolves an OpenAPI #/components/schemas/* ref into the targeted sub-schema", () => {
        const { container } = render(SchemaComponent, {
            props: {
                schema: allOfCompositeDoc,
                schemaRef: "#/components/schemas/Pet",
                value: { petType: "Dog", name: "Fido", bark: true },
            },
        });

        // The synthesised oneOf with per-option `const`s must produce a
        // discriminated union that the headless renderer turns into a
        // WAI-ARIA tablist (one tab per mapping entry).
        const tablist = container.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();

        const tabs = container.querySelectorAll('[role="tab"]');
        expect(tabs.length).toBe(2);

        // Tab labels are derived from the discriminator const on each
        // option — proving the resolved schema is `Pet` (with its
        // synthesised mapping), not `Decoy` (which has no tablist).
        const tabText = Array.from(tabs).map((t) => t.textContent);
        expect(tabText).toContain("Dog");
        expect(tabText).toContain("Cat");

        // Negative assertion: the `Decoy` schema's `placeholder` field
        // must not appear. If `schemaRef` were ignored, the first
        // schema in `components/schemas` would render instead and this
        // string would surface.
        expect(container.textContent).not.toContain("placeholder");
    });
});
