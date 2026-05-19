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
        // `openapi30.unit.test.ts` (lines 885–915): set the OpenAPI
        // document on `schema` and a JSON-pointer `schemaRef`, then
        // confirm the shadow DOM reflects the resolved sub-schema.
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
        expect(root).not.toBeNull();
        const objectEl = root?.querySelector("sc-object");
        expect(objectEl).not.toBeNull();

        if (objectEl !== null && objectEl !== undefined) {
            // The walked tree passed to `<sc-object>` must carry the
            // two `User` properties (`name`, `age`) — proving the
            // `schemaRef` was honoured rather than ignored.
            const tree = getProp(objectEl, "tree");
            expect(tree).toBeDefined();
            if (typeof tree === "object" && tree !== null && "fields" in tree) {
                const fields = tree.fields;
                expect(fields).toBeDefined();
                if (typeof fields === "object" && fields !== null) {
                    expect(Object.keys(fields)).toEqual(["name", "age"]);
                }
            }

            // The supplied value should thread through to `<sc-object>`,
            // proving the resolved schema and the value share a
            // coordinate frame.
            const v = getProp(objectEl, "value");
            expect(v).toEqual({ name: "Ada", age: 36 });
        }
        el.remove();
    });
});
