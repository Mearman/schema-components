/** @jsxImportSource solid-js */
/**
 * Read-only unit tests for the Solid `<SchemaView>`.
 *
 * Mirrors the React `<SchemaView>` tests in shape: a read-only render
 * with no `onChange` should produce display spans, not inputs.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { cleanup, render } from "@solidjs/testing-library";
import { SchemaView } from "../src/solid/SchemaView.tsx";

afterEach(() => {
    cleanup();
});

describe("Solid <SchemaView>", () => {
    it("renders display spans for primitive values without inputs", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
            age: z.number(),
        });
        const { container } = render(() => (
            <SchemaView
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada", age: 42 }}
            />
        ));
        expect(container.querySelectorAll("input").length).toBe(0);
        const nameSpan = container.querySelector("span#sc-root-name");
        expect(nameSpan?.textContent).toBe("Ada");
        const ageSpan = container.querySelector("span#sc-root-age");
        // Numbers are formatted via toLocaleString — accept any digit-only
        // representation so the test is locale-resilient.
        expect(ageSpan?.textContent).toMatch(/42/);
    });

    it("renders the em-dash placeholder for missing values", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
        });
        const { container } = render(() => (
            <SchemaView idPrefix="root" schema={schema} value={{ name: "" }} />
        ));
        const span = container.querySelector("span#sc-root-name");
        // Empty strings render as the em-dash placeholder.
        expect(span?.textContent).toBe("—");
    });

    it("renders a static enum value without a select element", () => {
        const schema = z.object({
            role: z.enum(["admin", "editor"]).meta({ description: "Role" }),
        });
        const { container } = render(() => (
            <SchemaView
                idPrefix="root"
                schema={schema}
                value={{ role: "admin" }}
            />
        ));
        expect(container.querySelectorAll("select").length).toBe(0);
        const span = container.querySelector("span#sc-root-role");
        expect(span?.textContent).toBe("admin");
    });

    it("renders a read-only array as a <ul> with no controls", () => {
        const schema = z.object({
            tags: z.array(z.string()).meta({ description: "Tags" }),
        });
        const { container } = render(() => (
            <SchemaView
                idPrefix="root"
                schema={schema}
                value={{ tags: ["a", "b", "c"] }}
            />
        ));
        const ul = container.querySelector("ul");
        expect(ul).not.toBeNull();
        const items = ul?.querySelectorAll("li") ?? [];
        expect(items.length).toBe(3);
        expect(container.querySelectorAll("button").length).toBe(0);
    });
});
