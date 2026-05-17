/**
 * Stories for the Radix Themes adapter with real Radix components.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";
import { Card, Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { radixResolver } from "schema-components/themes/radix";

import "../src/radix-setup.ts";
import { useThemeClass } from "../src/useThemeClass.ts";

const profileSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
    bio: z.string().max(280).optional().meta({ description: "Bio" }),
});

const addressSchema = z.object({
    street: z.string().meta({ description: "Street" }),
    city: z.string().meta({ description: "City" }),
    postcode: z.string().meta({ description: "Postcode" }),
});

const nestedSchema = z.object({
    name: z.string().meta({ description: "Name" }),
    address: addressSchema.meta({ description: "Address" }),
});

const initialProfile = {
    name: "Edsger Dijkstra",
    email: "edsger@example.com",
    role: "editor" as const,
    active: true,
    bio: "Computer scientist known for structured programming and algorithms.",
};

const nestedData = {
    name: "Barbara Liskov",
    address: {
        street: "32 Vassar Street",
        city: "Cambridge",
        postcode: "02139",
    },
};

function RadixPreview({
    schema,
    data,
    readOnly,
}: {
    schema: z.ZodType;
    data: unknown;
    readOnly: boolean;
}) {
    const [value, setValue] = useState<unknown>(data);
    const appearance = useThemeClass();

    return (
        <Theme appearance={appearance} accentColor="blue" radius="medium">
            <Card style={{ maxWidth: "36rem" }}>
                <SchemaProvider resolver={radixResolver}>
                    <SchemaComponent
                        schema={schema}
                        value={value}
                        onChange={(next) => {
                            setValue(next);
                        }}
                        readOnly={readOnly}
                    />
                </SchemaProvider>
            </Card>
        </Theme>
    );
}

const meta: Meta<typeof RadixPreview> = {
    title: "Theme Adapters/Radix",
    component: RadixPreview,
    tags: ["theme-adapter", "editable", "readonly"],
    argTypes: {
        readOnly: {
            control: "boolean",
            description:
                "Toggle the form between editable and read-only views.",
        },
    },
};

export default meta;
type Story = StoryObj<typeof RadixPreview>;

/**
 * Find a Radix TextField input by its sibling label text. Radix Themes
 * renders `Text as="label"` without a `for=` attribute, so we cannot use
 * role-name queries — instead we walk to the parent `.rt-Box` and pick the
 * `input` inside the adjacent `.rt-TextFieldRoot`.
 */
function findRadixInputByLabel(
    root: HTMLElement,
    labelText: string
): HTMLInputElement {
    const labels = Array.from(
        root.querySelectorAll<HTMLLabelElement>("label.rt-Text")
    );
    const label = labels.find((l) => l.textContent.trim() === labelText);
    if (label === undefined) {
        throw new Error(`Could not find Radix label with text "${labelText}"`);
    }
    const container = label.parentElement;
    if (container === null) {
        throw new Error(`Radix label "${labelText}" has no parent element`);
    }
    const input = container.querySelector<HTMLInputElement>(
        ".rt-TextFieldRoot input"
    );
    if (input === null) {
        throw new Error(
            `Radix label "${labelText}" has no associated TextField input`
        );
    }
    return input;
}

export const EditableProfile: Story = {
    args: {
        schema: profileSchema,
        data: initialProfile,
        readOnly: false,
    },
    play: async ({ canvasElement, step }) => {
        await step(
            "Radix Themes components render (not the headless fallback)",
            async () => {
                await expect(
                    canvasElement.querySelectorAll(".rt-TextFieldRoot").length
                ).toBeGreaterThan(0);
                await expect(
                    canvasElement.querySelector(".rt-SelectTrigger")
                ).not.toBeNull();
                await expect(
                    canvasElement.querySelector(".rt-CheckboxRoot")
                ).not.toBeNull();
                // The outer Radix Theme provider seeds the radix-themes class.
                await expect(
                    canvasElement.querySelector(".radix-themes")
                ).not.toBeNull();
            }
        );

        await step("typing updates the name input", async () => {
            const nameInput = findRadixInputByLabel(canvasElement, "Full name");
            await expect(nameInput).toHaveValue("Edsger Dijkstra");
            await userEvent.clear(nameInput);
            await userEvent.type(nameInput, "Margaret Hamilton");
            await waitFor(async () => {
                await expect(nameInput).toHaveValue("Margaret Hamilton");
            });
        });

        await step(
            "toggling Active flips the Radix Checkbox state",
            async () => {
                // Radix Checkbox is a button[role=checkbox] with data-state.
                // The "Active" label sits as a sibling <label class="rt-Text">
                // without a for= attribute, so the accessible name is not
                // automatically computed. Match by class instead.
                const checkbox =
                    canvasElement.querySelector<HTMLButtonElement>(
                        ".rt-CheckboxRoot"
                    );
                if (checkbox === null) {
                    throw new Error("Expected a .rt-CheckboxRoot element");
                }
                await expect(checkbox.getAttribute("data-state")).toBe(
                    "checked"
                );
                await userEvent.click(checkbox);
                await waitFor(async () => {
                    await expect(checkbox.getAttribute("data-state")).toBe(
                        "unchecked"
                    );
                });
            }
        );

        await step(
            "Role enum renders the Radix Select trigger with current value",
            async () => {
                const trigger =
                    canvasElement.querySelector(".rt-SelectTrigger");
                if (trigger === null) {
                    throw new Error("Expected a .rt-SelectTrigger element");
                }
                await expect(trigger.textContent).toContain("editor");
                await expect(trigger.getAttribute("role")).toBe("combobox");
            }
        );
    },
};

export const ReadOnlyProfile: Story = {
    args: {
        schema: profileSchema,
        data: initialProfile,
        readOnly: true,
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);

        await step("no editable inputs render in read-only mode", async () => {
            await expect(canvas.queryAllByRole("textbox")).toHaveLength(0);
            await expect(canvas.queryAllByRole("checkbox")).toHaveLength(0);
            await expect(canvas.queryAllByRole("combobox")).toHaveLength(0);
            await expect(
                canvasElement.querySelector(".rt-TextFieldRoot")
            ).toBeNull();
            await expect(
                canvasElement.querySelector(".rt-SelectTrigger")
            ).toBeNull();
            await expect(
                canvasElement.querySelector(".rt-CheckboxRoot")
            ).toBeNull();
        });

        await step(
            "Radix Text spans render every read-only value",
            async () => {
                const texts = canvasElement.querySelectorAll(".rt-Text");
                await expect(texts.length).toBeGreaterThan(0);
            }
        );

        await step("data values appear as text", async () => {
            await expect(
                canvas.getByText("Edsger Dijkstra")
            ).toBeInTheDocument();
            await expect(
                canvas.getByText("edsger@example.com")
            ).toBeInTheDocument();
            await expect(canvas.getByText("editor")).toBeInTheDocument();
            // Boolean true renders as "Yes" via Radix Text.
            await expect(canvas.getByText("Yes")).toBeInTheDocument();
        });
    },
};

export const NestedEditable: Story = {
    args: {
        schema: nestedSchema,
        data: nestedData,
        readOnly: false,
    },
    play: async ({ canvasElement, step }) => {
        await step(
            "nested Address group renders with a bold heading",
            async () => {
                // The Radix object renderer emits a Text with size="4"
                // weight="bold" as the section heading.
                const heading = canvasElement.querySelector(
                    ".rt-Text.rt-r-size-4.rt-r-weight-bold"
                );
                await expect(heading).not.toBeNull();
                await expect(heading?.textContent).toBe("Address");
            }
        );

        await step("nested fields are editable", async () => {
            const streetInput = findRadixInputByLabel(canvasElement, "Street");
            const cityInput = findRadixInputByLabel(canvasElement, "City");
            await expect(streetInput).toHaveValue("32 Vassar Street");
            await expect(cityInput).toHaveValue("Cambridge");

            await userEvent.clear(streetInput);
            await userEvent.type(streetInput, "1 Microsoft Way");
            await waitFor(async () => {
                await expect(streetInput).toHaveValue("1 Microsoft Way");
            });
        });

        await step(
            "updating a nested field does not reset outer fields",
            async () => {
                const outerName = findRadixInputByLabel(canvasElement, "Name");
                await expect(outerName).toHaveValue("Barbara Liskov");

                const cityInput = findRadixInputByLabel(canvasElement, "City");
                await expect(cityInput).toHaveValue("Cambridge");
            }
        );
    },
};

export const NestedReadOnly: Story = {
    args: {
        schema: nestedSchema,
        data: nestedData,
        readOnly: true,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.queryAllByRole("textbox")).toHaveLength(0);
        await expect(canvas.getByText("Barbara Liskov")).toBeInTheDocument();
        await expect(canvas.getByText("32 Vassar Street")).toBeInTheDocument();
        await expect(canvas.getByText("Cambridge")).toBeInTheDocument();
        await expect(canvas.getByText("02139")).toBeInTheDocument();
        // Nested heading still emitted in read-only nested view.
        const heading = canvasElement.querySelector(
            ".rt-Text.rt-r-size-4.rt-r-weight-bold"
        );
        await expect(heading?.textContent).toBe("Address");
    },
};
