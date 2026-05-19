/** @jsxImportSource solid-js */
/**
 * Kitchen-sink unit tests for the Solid `<SchemaComponent>`.
 *
 * Mirrors the React `a11y-react.unit.test.ts` shape — render a
 * representative schema and assert the produced DOM exposes the
 * expected accessibility ids, labels, and structural tags. The Solid
 * tests use `@solidjs/testing-library` so the JSX transform runs
 * through `vite-plugin-solid` per the `unit-solid` vitest project
 * config.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { cleanup, render } from "@solidjs/testing-library";
import { SchemaComponent } from "../src/solid/SchemaComponent.tsx";

afterEach(() => {
    cleanup();
});

describe("Solid <SchemaComponent> — kitchen sink", () => {
    it("renders a string field with id derived from idPrefix + key", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
            />
        ));
        const input =
            container.querySelector<HTMLInputElement>("input#sc-root-name");
        expect(input).not.toBeNull();
        expect(input?.getAttribute("type")).toBe("text");
        // Solid sets `value` as a DOM property rather than an attribute.
        expect(input?.value).toBe("Ada");
    });

    it("renders an email input with the correct type attribute", () => {
        const schema = z.object({
            email: z.email().meta({ description: "Email" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ email: "ada@example.com" }}
            />
        ));
        const input = container.querySelector("input#sc-root-email");
        expect(input?.getAttribute("type")).toBe("email");
    });

    it("renders a number field with min/max attributes from constraints", () => {
        const schema = z.object({
            age: z.number().min(0).max(120).meta({ description: "Age" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ age: 32 }}
            />
        ));
        const input = container.querySelector("input#sc-root-age");
        expect(input?.getAttribute("type")).toBe("number");
        expect(input?.getAttribute("min")).toBe("0");
        expect(input?.getAttribute("max")).toBe("120");
    });

    it("renders a boolean field as a checkbox with checked state", () => {
        const schema = z.object({
            active: z.boolean().meta({ description: "Active" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ active: true }}
            />
        ));
        const input = container.querySelector<HTMLInputElement>(
            "input#sc-root-active"
        );
        expect(input?.type).toBe("checkbox");
        expect(input?.checked).toBe(true);
    });

    it("renders an enum field as a <select> with each option", () => {
        const schema = z.object({
            role: z
                .enum(["admin", "editor", "viewer"])
                .meta({ description: "Role" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ role: "editor" }}
            />
        ));
        const select = container.querySelector("select#sc-root-role");
        expect(select).not.toBeNull();
        const options = select?.querySelectorAll("option") ?? [];
        // Includes the placeholder "Select…" so 4 entries total.
        expect(options.length).toBe(4);
        const optionValues = Array.from(options).map((opt) =>
            opt.getAttribute("value")
        );
        expect(optionValues).toContain("admin");
        expect(optionValues).toContain("editor");
        expect(optionValues).toContain("viewer");
    });

    it("renders nested object fields with correct path-derived ids", () => {
        const schema = z.object({
            address: z.object({
                city: z.string().meta({ description: "City" }),
            }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ address: { city: "London" } }}
            />
        ));
        const input = container.querySelector<HTMLInputElement>(
            "input#sc-root-address-city"
        );
        expect(input).not.toBeNull();
        expect(input?.value).toBe("London");
    });

    it("emits aria-describedby + hint element when a constraint applies", () => {
        const schema = z.object({
            name: z.string().min(3).max(50).meta({ description: "Name" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
            />
        ));
        const input = container.querySelector("input#sc-root-name");
        expect(input?.getAttribute("aria-describedby")).toBe(
            "sc-root-name-hint"
        );
        const hint = container.querySelector("small#sc-root-name-hint");
        expect(hint).not.toBeNull();
        expect(hint?.textContent).toMatch(/Minimum 3 characters/);
    });

    it("renders an editable array with an Add button", () => {
        const schema = z.object({
            tags: z.array(z.string()).meta({ description: "Tags" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ tags: ["a", "b"] }}
            />
        ));
        const ul = container.querySelector("ul");
        expect(ul).not.toBeNull();
        const items = ul?.querySelectorAll("li") ?? [];
        expect(items.length).toBe(2);
        const addButton = container.querySelector(
            'button[aria-label="Add item"]'
        );
        expect(addButton).not.toBeNull();
    });

    it("falls back to the structural key as label when description is absent", () => {
        const schema = z.object({
            name: z.string(),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
            />
        ));
        const label = container.querySelector("label");
        expect(label?.textContent).toContain("name");
    });

    it("renders read-only labels without inputs when readOnly is set", () => {
        const schema = z.object({
            name: z.string().meta({ description: "Name" }),
        });
        const { container } = render(() => (
            <SchemaComponent
                idPrefix="root"
                schema={schema}
                value={{ name: "Ada" }}
                readOnly
            />
        ));
        const input = container.querySelector("input#sc-root-name");
        expect(input).toBeNull();
        const span = container.querySelector("span#sc-root-name");
        expect(span?.textContent).toBe("Ada");
    });
});
