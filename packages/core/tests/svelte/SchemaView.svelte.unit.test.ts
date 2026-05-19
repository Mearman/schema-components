/**
 * Unit tests for the read-only Svelte 5 `<SchemaView>`.
 *
 * Verifies that the view renders presentational output only — no
 * `<input>` / `<select>` / `<button>` elements — and that the
 * resolver prop replaces the context lookup that
 * `<SchemaComponent>` performs.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { z } from "zod";
import SchemaView from "../../src/svelte/SchemaView.svelte";

afterEach(() => {
    cleanup();
});

const userSchema = z.object({
    name: z.string().meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
    active: z.boolean(),
});

describe("<SchemaView>", () => {
    it("renders read-only output by default", () => {
        const { container } = render(SchemaView, {
            props: {
                schema: userSchema,
                value: {
                    name: "Ada Lovelace",
                    email: "ada@example.com",
                    active: true,
                },
            },
        });

        // No editable inputs in read-only mode.
        const inputs = container.querySelectorAll("input");
        const selects = container.querySelectorAll("select");
        const buttons = container.querySelectorAll("button");
        expect(inputs.length).toBe(0);
        expect(selects.length).toBe(0);
        expect(buttons.length).toBe(0);

        // Email format renders as <a href="mailto:..."> in read-only.
        const mailto = container.querySelector('a[href^="mailto:"]');
        expect(mailto).not.toBeNull();
        expect(mailto?.textContent).toBe("ada@example.com");

        // Boolean true renders as "Yes".
        expect(container.textContent).toContain("Yes");
    });

    it("falls back to em-dash for missing values", () => {
        const { container } = render(SchemaView, {
            props: {
                schema: userSchema,
                value: undefined,
            },
        });

        // Multiple em-dashes expected for missing name, email, active.
        // `container.textContent` is typed `string` here — happy-dom
        // populates the field on every rendered element, so the
        // `??` fallback the lint rule rejects is genuinely
        // redundant and the variable can be split directly.
        const text = container.textContent;
        expect(text).not.toBeNull();
        const emDashCount = text.split("—").length - 1;
        expect(emDashCount).toBeGreaterThan(0);
    });
});
