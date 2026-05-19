/**
 * `<schema-component>` integration test.
 *
 * Drives the orchestrating element with a small kitchen-sink schema
 * and asserts:
 *
 * 1. The element registers under the canonical tag.
 * 2. Property assignment (schema, value) drives the render output.
 * 3. The shadow DOM contains the dispatched per-type elements.
 * 4. Setting `value` causes the element to re-render.
 *
 * Runs under happy-dom — see vitest.config.ts's `unit-lit` project.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { registerSchemaComponents } from "../src/lit/registry.ts";
import { awaitReady, getProp } from "./lit-test-utils.ts";

beforeAll(() => {
    registerSchemaComponents();
});

describe("<schema-component>", () => {
    it("registers under the canonical tag", () => {
        const ctor = customElements.get("schema-component");
        expect(ctor).toBeDefined();
    });

    it("renders nothing when no schema is supplied", async () => {
        const el = document.createElement("schema-component");
        document.body.appendChild(el);
        await awaitReady(el);
        expect(el.shadowRoot).not.toBeNull();
        expect(el.shadowRoot?.textContent.trim() ?? "").toBe("");
        el.remove();
    });

    it("renders an object schema with one field per property", async () => {
        const userSchema = z.object({ name: z.string(), age: z.number() });
        const el = document.createElement("schema-component");
        Reflect.set(el, "schema", userSchema);
        Reflect.set(el, "value", { name: "Ada", age: 36 });
        document.body.appendChild(el);
        await awaitReady(el);
        const root = el.shadowRoot;
        expect(root).not.toBeNull();
        if (root === null) {
            el.remove();
            return;
        }
        const objectEl = root.querySelector("sc-object");
        expect(objectEl).not.toBeNull();
        el.remove();
    });

    it("updates the shadow DOM when value changes", async () => {
        const userSchema = z.object({ name: z.string() });
        const el = document.createElement("schema-component");
        Reflect.set(el, "schema", userSchema);
        Reflect.set(el, "value", { name: "Ada" });
        document.body.appendChild(el);
        await awaitReady(el);
        Reflect.set(el, "value", { name: "Grace" });
        await awaitReady(el);
        // The render path threads the new value through to a nested
        // sc-object → sc-string, so the shadow root structure stays
        // stable but the property values update.
        const objectEl = el.shadowRoot?.querySelector("sc-object");
        expect(objectEl).not.toBeNull();
        expect(objectEl).toBeDefined();
        if (objectEl !== null && objectEl !== undefined) {
            const v = getProp(objectEl, "value");
            expect(v).toEqual({ name: "Grace" });
        }
        el.remove();
    });

    it("readOnly reflects to the `readonly` attribute", async () => {
        const userSchema = z.object({ name: z.string() });
        const el = document.createElement("schema-component");
        Reflect.set(el, "schema", userSchema);
        Reflect.set(el, "readOnly", true);
        document.body.appendChild(el);
        await awaitReady(el);
        // Lit's `reflect: true` writes the boolean to the matching
        // attribute on every render — verify the attribute landed.
        expect(el.hasAttribute("readonly")).toBe(true);
        el.remove();
    });

    it("resolves the `schemaRef` property against an OpenAPI document", async () => {
        // Regression guard for the cross-framework `ref` → `schemaRef`
        // rename. Mirrors the React assertion in
        // `openapi30.unit.test.ts` (lines 885–915), and matches the
        // peer-adapter pattern (Vue/Solid/Svelte): the fixture places
        // a structurally-distinct *decoy* schema FIRST and points
        // `schemaRef` at a later schema. A bug that always resolves
        // to the first `components/schemas` entry (the precise
        // failure mode the rename was designed to prevent) would
        // surface the decoy's `code` field and fail the assertions.
        //
        // `schemaRef` on the Lit element is property-only (declared
        // with `attribute: false`) — assign it via property, not
        // attribute. Lit updates asynchronously, so await
        // `updateComplete` before asserting on rendered output.
        const oasDoc = {
            openapi: "3.1.0",
            info: { title: "Users", version: "1.0" },
            paths: {},
            components: {
                schemas: {
                    // Decoy — listed first so the test fails if
                    // `schemaRef` is dropped and the renderer falls
                    // back to the first schema in the document.
                    Status: {
                        type: "object",
                        properties: { code: { type: "integer" } },
                        required: ["code"],
                    },
                    User: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            age: { type: "integer" },
                        },
                        required: ["name"],
                    },
                },
            },
        };
        const el = document.createElement("schema-component");
        Reflect.set(el, "schema", oasDoc);
        Reflect.set(el, "schemaRef", "#/components/schemas/User");
        Reflect.set(el, "value", { name: "Ada", age: 36 });
        document.body.appendChild(el);
        await awaitReady(el);

        // The resolved `User` schema is an object — the renderer must
        // dispatch through `<sc-object>` and not leave the shadow root
        // empty (which would happen if `schemaRef` failed to resolve
        // and normalisation produced the bare OpenAPI document, which
        // has no top-level `type`).
        const root = el.shadowRoot;
        if (root === null) throw new Error("shadowRoot is null");
        const objectEl = root.querySelector("sc-object");
        if (objectEl === null) {
            throw new Error("expected <sc-object> in shadow root");
        }

        // Past the existence gate, assert unconditionally. Using
        // `toMatchObject` fails cleanly if the tree shape is wrong;
        // wrapping in `if` guards would silently skip the assertion
        // if the property is missing.
        const tree = getProp(objectEl, "tree");
        expect(tree).toMatchObject({
            type: "object",
            fields: {
                name: expect.anything() as unknown,
                age: expect.anything() as unknown,
            },
        });

        // Negative assertion — proves the decoy schema's `code` field
        // was NOT resolved, so the test would fail on a "always pick
        // first schema" regression.
        const fields = (tree as { fields: Record<string, unknown> }).fields;
        expect(Object.keys(fields)).toEqual(["name", "age"]);
        expect(fields).not.toHaveProperty("code");

        // The supplied value should thread through to `<sc-object>`,
        // proving the resolved schema and the value share a
        // coordinate frame.
        const v = getProp(objectEl, "value");
        expect(v).toEqual({ name: "Ada", age: 36 });
        el.remove();
    });
});
