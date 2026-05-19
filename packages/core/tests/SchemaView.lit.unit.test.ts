/**
 * `<schema-view>` integration test.
 *
 * The read-only variant of `<schema-component>` — subclass that
 * forces `readOnly = true` on construct and connect.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { registerSchemaComponents } from "../src/lit/registry.ts";
import { awaitReady } from "./lit-test-utils.ts";

beforeAll(() => {
    registerSchemaComponents();
});

describe("<schema-view>", () => {
    it("registers under the canonical tag", () => {
        const ctor = customElements.get("schema-view");
        expect(ctor).toBeDefined();
    });

    it("forces readOnly even when the property is assigned false", async () => {
        const userSchema = z.object({ name: z.string() });
        const el = document.createElement("schema-view");
        Reflect.set(el, "schema", userSchema);
        Reflect.set(el, "value", { name: "Ada" });
        // Attempt to flip back to editable — connectedCallback should
        // win and force readOnly = true.
        Reflect.set(el, "readOnly", false);
        document.body.appendChild(el);
        await awaitReady(el);
        expect(Reflect.get(el, "readOnly")).toBe(true);
        el.remove();
    });

    it("renders the same shadow structure as <schema-component>", async () => {
        const userSchema = z.object({ name: z.string() });
        const el = document.createElement("schema-view");
        Reflect.set(el, "schema", userSchema);
        Reflect.set(el, "value", { name: "Ada" });
        document.body.appendChild(el);
        await awaitReady(el);
        const root = el.shadowRoot;
        expect(root?.querySelector("sc-object")).not.toBeNull();
        el.remove();
    });
});
