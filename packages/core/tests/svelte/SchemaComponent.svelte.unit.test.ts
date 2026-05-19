/**
 * Kitchen-sink unit tests for the Svelte 5 `<SchemaComponent>`.
 *
 * Exercises the full dispatch chain — normalisation, walk, renderer
 * dispatch, recursive descent through the headless resolver, and
 * value propagation through the `onChange` callback — against a Zod
 * schema covering every primitive shape the React adapter's
 * equivalent test suite covers.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { z } from "zod";
import SchemaComponent from "../../src/svelte/SchemaComponent.svelte";

afterEach(() => {
    cleanup();
});

const kitchenSink = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    age: z.number().int().min(0).max(150).meta({ description: "Age" }),
    active: z.boolean().meta({ description: "Active" }),
    tags: z.array(z.string()).meta({ description: "Tags" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
});

/**
 * Narrow `container.querySelector(...)` to an `HTMLInputElement`
 * (or throw). Replaces `!` non-null assertions and `as` casts that
 * the lint rules disallow on test files.
 */
function queryInput(container: ParentNode, selector: string): HTMLInputElement {
    const el = container.querySelector(selector);
    if (el === null) {
        throw new Error(`Expected to find input matching ${selector}.`);
    }
    if (!(el instanceof HTMLInputElement)) {
        throw new Error(
            `Expected element matching ${selector} to be an HTMLInputElement.`
        );
    }
    return el;
}

function querySelect(container: ParentNode): HTMLSelectElement {
    const el = container.querySelector("select");
    if (el === null) {
        throw new Error("Expected to find a <select> element.");
    }
    if (!(el instanceof HTMLSelectElement)) {
        throw new Error("Expected <select> to be an HTMLSelectElement.");
    }
    return el;
}

describe("<SchemaComponent>", () => {
    it("renders an editable input per field of a Zod schema", () => {
        const { container } = render(SchemaComponent, {
            props: {
                schema: kitchenSink,
                value: {
                    name: "Ada Lovelace",
                    age: 36,
                    active: true,
                    tags: ["math", "computing"],
                    role: "admin",
                },
                onChange: () => {
                    /* noop */
                },
            },
        });

        // String input: text
        const nameInput = queryInput(container, 'input[type="text"]');
        expect(nameInput.value).toBe("Ada Lovelace");

        // Number input
        const ageInput = queryInput(container, 'input[type="number"]');
        expect(ageInput.value).toBe("36");

        // Boolean checkbox
        const activeInput = queryInput(container, 'input[type="checkbox"]');
        expect(activeInput.checked).toBe(true);

        // Enum select
        const roleSelect = querySelect(container);
        expect(roleSelect.value).toBe("admin");

        // Array list items
        const tagInputs = container.querySelectorAll('input[type="text"]');
        expect(tagInputs.length).toBeGreaterThanOrEqual(3); // name + 2 tag items
    });

    it("renders read-only spans when readOnly is true", () => {
        const { container } = render(SchemaComponent, {
            props: {
                schema: kitchenSink,
                value: {
                    name: "Ada Lovelace",
                    age: 36,
                    active: false,
                    tags: ["x"],
                    role: "viewer",
                },
                readOnly: true,
            },
        });

        // No <input> elements should be rendered in read-only mode
        const inputs = container.querySelectorAll("input");
        // Checkboxes are inputs but render as spans here; verify none exist.
        expect(inputs.length).toBe(0);
        // Some span content must reflect the value
        expect(container.textContent).toContain("Ada Lovelace");
        expect(container.textContent).toContain("36");
    });

    it("propagates onChange when a string field changes", async () => {
        const changes: unknown[] = [];
        const { container } = render(SchemaComponent, {
            props: {
                schema: kitchenSink,
                value: {
                    name: "Initial",
                    age: 1,
                    active: false,
                    tags: [],
                    role: "viewer",
                },
                onChange: (next: unknown) => {
                    changes.push(next);
                },
            },
        });

        const nameInput = queryInput(container, 'input[type="text"]');
        await fireEvent.change(nameInput, { target: { value: "Updated" } });

        // The onChange handler is fired with the merged object — each
        // edit emits the entire root value.
        const last = changes[changes.length - 1];
        expect(last).toBeDefined();
        expect(last).toMatchObject({ name: "Updated" });
    });

    it("renders the headless object fieldset with structural keys as label fallbacks", () => {
        const { container } = render(SchemaComponent, {
            props: {
                schema: z.object({ alpha: z.string() }),
                value: { alpha: "value" },
                onChange: () => {
                    /* noop */
                },
            },
        });

        const labels = container.querySelectorAll("label");
        // "alpha" key surfaces as label fallback when no description set.
        expect(labels.length).toBe(1);
        const labelText = labels[0]?.textContent ?? "";
        expect(labelText).toContain("alpha");
    });
});
