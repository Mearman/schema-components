/**
 * Tests for OpenAPI 3.1 discriminator normalisation parity with 3.0.
 *
 * OpenAPI 3.1 keeps the `discriminator: { propertyName, mapping }`
 * keyword from 3.0 — it is not removed in the spec. Without applying
 * discriminator → `const` injection on 3.1 documents, the walker's
 * discriminated-union detection silently fails on schemas that work
 * for the equivalent 3.0 document. These tests pin the parity in.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ApiOperation } from "../src/openapi/components.tsx";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { IS_PREACT } from "./helpers.ts";

/**
 * Under `preact/compat`, `createElement` strips the `ref` prop from the
 * vnode prop bag, so `<SchemaComponent ref="/animals/post">` reaches the
 * component with `refInput === undefined` and silently resolves to the
 * first `components/schemas` entry instead of the requested operation
 * body. Tests that depend on the `ref` prop reaching the component are
 * skipped under Preact; the React-side contract is pinned by the `unit`
 * project run. See the comment on the matching skip in
 * `openapi-components.unit.test.tsx` for the longer-term fix.
 */
const itReact = IS_PREACT ? it.skip : it;

// ---------------------------------------------------------------------------
// Test documents — identical apart from the `openapi` version tag
// ---------------------------------------------------------------------------

const oas31Doc = {
    openapi: "3.1.0",
    info: { title: "Animals 3.1", version: "1.0" },
    paths: {
        "/animals": {
            post: {
                operationId: "createAnimal31",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                discriminator: {
                                    propertyName: "kind",
                                    mapping: {
                                        Dog: "#/components/schemas/Dog",
                                        Cat: "#/components/schemas/Cat",
                                    },
                                },
                                oneOf: [
                                    {
                                        type: "object",
                                        properties: {
                                            kind: { type: "string" },
                                            name: { type: "string" },
                                        },
                                        required: ["kind", "name"],
                                    },
                                    {
                                        type: "object",
                                        properties: {
                                            kind: { type: "string" },
                                            name: { type: "string" },
                                        },
                                        required: ["kind", "name"],
                                    },
                                ],
                            },
                        },
                    },
                },
                responses: {
                    "201": { description: "Created" },
                },
            },
        },
    },
    components: {
        schemas: {
            Dog: { type: "object" },
            Cat: { type: "object" },
        },
    },
};

const oas30Doc = { ...oas31Doc, openapi: "3.0.3" };

// ---------------------------------------------------------------------------
// Discriminator-as-tabs parity
// ---------------------------------------------------------------------------

describe("OAS 3.1 discriminator parity with 3.0", () => {
    it("renders 3.1 discriminator as WAI-ARIA tabs identical to 3.0", () => {
        const html30 = renderToString(
            createElement(ApiOperation, {
                schema: oas30Doc,
                path: "/animals",
                method: "post",
            })
        );
        const html31 = renderToString(
            createElement(ApiOperation, {
                schema: oas31Doc,
                path: "/animals",
                method: "post",
            })
        );

        expect(html30).toContain('role="tablist"');
        expect(html31).toContain('role="tablist"');

        const tabs30 = (html30.match(/role="tab"/g) ?? []).length;
        const tabs31 = (html31.match(/role="tab"/g) ?? []).length;
        expect(tabs31).toBe(tabs30);
        expect(tabs31).toBe(2);

        // Tab labels derive from the discriminator mapping in both versions.
        expect(html31).toContain(">Dog<");
        expect(html31).toContain(">Cat<");
    });

    itReact(
        "renders 3.1 discriminator via <SchemaComponent> with tablist",
        () => {
            const html = renderToString(
                createElement(SchemaComponent, {
                    schema: oas31Doc,
                    ref: "/animals/post",
                    value: { kind: "Dog", name: "Fido" },
                })
            );
            expect(html).toContain('role="tablist"');
            expect(html).toContain(">Dog<");
            expect(html).toContain(">Cat<");
        }
    );
});
