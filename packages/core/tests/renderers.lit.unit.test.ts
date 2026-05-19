/**
 * Per-element renderer tests.
 *
 * Directly instantiates each built-in `<sc-*>` element, sets the
 * canonical per-field props, and asserts the rendered shadow DOM
 * matches the expected shape. Mirrors the React renderer-by-renderer
 * tests under `tests/headless-renderers.unit.test.tsx` but exercises
 * the Lit pipeline.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { registerSchemaComponents } from "../src/lit/registry.ts";
import { walk } from "../src/core/walker.ts";
import { normaliseSchema } from "../src/core/adapter.ts";
import { z } from "zod";
import type { WalkedField } from "../src/core/types.ts";
import { awaitReady } from "./lit-test-utils.ts";

beforeAll(() => {
    registerSchemaComponents();
});

function walkSchema(schema: unknown): WalkedField {
    const { jsonSchema, rootMeta, rootDocument } = normaliseSchema(schema);
    return walk(jsonSchema, { rootMeta, rootDocument });
}

interface ChangeSink {
    callback: (v: unknown) => void;
    seen: unknown[];
}

function changeSink(): ChangeSink {
    const seen: unknown[] = [];
    return {
        seen,
        callback: (v) => {
            seen.push(v);
        },
    };
}

describe("<sc-string>", () => {
    it("renders an editable text input by default", async () => {
        const tree = walkSchema(z.string());
        const sink = changeSink();
        const el = document.createElement("sc-string");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", "hello");
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "change", sink.callback);
        document.body.appendChild(el);
        await awaitReady(el);
        const input = el.shadowRoot?.querySelector("input");
        expect(input).not.toBeNull();
        if (input instanceof HTMLInputElement) {
            expect(input.type).toBe("text");
            expect(input.value).toBe("hello");
        }
        el.remove();
    });

    it("renders a span when readOnly", async () => {
        const tree = walkSchema(z.string());
        const el = document.createElement("sc-string");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", "hello");
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "readOnly", true);
        document.body.appendChild(el);
        await awaitReady(el);
        const span = el.shadowRoot?.querySelector("span");
        expect(span).not.toBeNull();
        expect(span?.textContent.trim()).toBe("hello");
        el.remove();
    });

    it("emits sc-change with the input value on user input", async () => {
        const tree = walkSchema(z.string());
        const sink = changeSink();
        const el = document.createElement("sc-string");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", "");
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "change", sink.callback);
        document.body.appendChild(el);
        await awaitReady(el);
        const input = el.shadowRoot?.querySelector("input");
        if (input instanceof HTMLInputElement) {
            input.value = "Ada";
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        expect(sink.seen).toEqual(["Ada"]);
        el.remove();
    });
});

describe("<sc-number>", () => {
    it("emits a numeric value on input", async () => {
        const tree = walkSchema(z.number());
        const sink = changeSink();
        const el = document.createElement("sc-number");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", 1);
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "change", sink.callback);
        document.body.appendChild(el);
        await awaitReady(el);
        const input = el.shadowRoot?.querySelector("input");
        if (input instanceof HTMLInputElement) {
            expect(input.type).toBe("number");
            input.value = "42";
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        expect(sink.seen).toEqual([42]);
        el.remove();
    });
});

describe("<sc-boolean>", () => {
    it("emits boolean changes on checkbox toggle", async () => {
        const tree = walkSchema(z.boolean());
        const sink = changeSink();
        const el = document.createElement("sc-boolean");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", false);
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        Reflect.set(el, "change", sink.callback);
        document.body.appendChild(el);
        await awaitReady(el);
        const input = el.shadowRoot?.querySelector("input");
        if (input instanceof HTMLInputElement) {
            expect(input.type).toBe("checkbox");
            input.checked = true;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        expect(sink.seen).toEqual([true]);
        el.remove();
    });
});

describe("<sc-null>", () => {
    it("renders an em-dash regardless of value", async () => {
        const tree = walkSchema(z.null());
        const el = document.createElement("sc-null");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", null);
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        document.body.appendChild(el);
        await awaitReady(el);
        expect(el.shadowRoot?.textContent.trim()).toBe("—");
        el.remove();
    });
});

describe("<sc-never>", () => {
    it("renders the 'never matches' placeholder", async () => {
        const tree = walkSchema(z.never());
        const el = document.createElement("sc-never");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", undefined);
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        document.body.appendChild(el);
        await awaitReady(el);
        const txt = el.shadowRoot?.textContent.trim() ?? "";
        expect(txt).toMatch(/never matches/i);
        el.remove();
    });
});

describe("<sc-enum>", () => {
    it("renders a <select> with one option per enum value", async () => {
        const schema = z.enum(["admin", "editor", "viewer"]);
        const tree = walkSchema(schema);
        const el = document.createElement("sc-enum");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", "admin");
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        document.body.appendChild(el);
        await awaitReady(el);
        const select = el.shadowRoot?.querySelector("select");
        expect(select).not.toBeNull();
        const options = el.shadowRoot?.querySelectorAll("option");
        // Plus one for the leading "Select…" placeholder.
        expect(options?.length).toBe(4);
        el.remove();
    });
});

describe("<sc-literal>", () => {
    it("renders the literal value", async () => {
        const tree = walkSchema(z.literal("yes"));
        const el = document.createElement("sc-literal");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", "yes");
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        document.body.appendChild(el);
        await awaitReady(el);
        expect(el.shadowRoot?.textContent.trim()).toContain("yes");
        el.remove();
    });
});

describe("<sc-unknown>", () => {
    it("renders a text input when editable", async () => {
        const tree = walkSchema(z.unknown());
        const el = document.createElement("sc-unknown");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "value", "anything");
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        document.body.appendChild(el);
        await awaitReady(el);
        const input = el.shadowRoot?.querySelector("input");
        if (input instanceof HTMLInputElement) {
            expect(input.value).toBe("anything");
        }
        el.remove();
    });
});

describe("<sc-file>", () => {
    it("renders an input[type=file] with accept attribute when constrained", async () => {
        // A JSON Schema file-shaped field — `format: "binary"` is
        // the walker's signal to build a `FileField` from a plain
        // string schema; `contentMediaType` then surfaces as the
        // rendered `accept` attribute.
        const fileSchema = {
            type: "string",
            format: "binary",
            contentMediaType: "image/png",
        };
        const tree = walkSchema(fileSchema);
        const el = document.createElement("sc-file");
        Reflect.set(el, "tree", tree);
        Reflect.set(el, "path", "root");
        Reflect.set(el, "meta", tree.meta);
        Reflect.set(el, "constraints", tree.constraints);
        document.body.appendChild(el);
        await awaitReady(el);
        const input = el.shadowRoot?.querySelector("input");
        if (input instanceof HTMLInputElement) {
            expect(input.type).toBe("file");
            expect(input.getAttribute("accept")).toBe("image/png");
        }
        el.remove();
    });
});
