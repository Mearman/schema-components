/**
 * Stories for the shadcn/ui theme adapter with Tailwind CSS.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { shadcnResolver } from "schema-components/themes/shadcn";

import "../src/tailwind.css";

const profileSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    bio: z.string().max(280).meta({ description: "Bio" }),
    website: z.string().optional().meta({ description: "Website" }),
    notifications: z.boolean().meta({ description: "Email notifications" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
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
    name: "Ada Lovelace",
    bio: "Mathematician and first programmer.",
    website: "https://example.com",
    notifications: true,
    role: "admin" as const,
};

const nestedData = {
    name: "Charles Babbage",
    address: {
        street: "5 Devonshire Street",
        city: "London",
        postcode: "W1W 5HA",
    },
};

function ShadcnPreview({
    schema,
    data,
    readOnly,
}: {
    schema: z.ZodType;
    data: unknown;
    readOnly: boolean;
}) {
    const [value, setValue] = useState<unknown>(data);

    return (
        <SchemaProvider resolver={shadcnResolver}>
            <div className="max-w-xl space-y-4 rounded-lg border border-slate-200 p-6 dark:border-slate-700">
                <SchemaComponent
                    schema={schema}
                    value={value}
                    onChange={(next) => {
                        setValue(next);
                    }}
                    readOnly={readOnly}
                />
            </div>
        </SchemaProvider>
    );
}

const meta: Meta<typeof ShadcnPreview> = {
    title: "Theme Adapters/shadcn",
    component: ShadcnPreview,
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
type Story = StoryObj<typeof ShadcnPreview>;

export const EditableProfile: Story = {
    args: {
        schema: profileSchema,
        data: initialProfile,
        readOnly: false,
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);

        await step(
            "shadcn Tailwind classes render on form controls",
            async () => {
                // shadcn-style inputs carry the `border-input` utility.
                const inputs = canvasElement.querySelectorAll(
                    "input.border-input, input.border-primary"
                );
                await expect(inputs.length).toBeGreaterThan(0);
                // The Role enum uses a native <select> with `border-input`.
                await expect(
                    canvasElement.querySelector("select.border-input")
                ).not.toBeNull();
                // Boolean checkbox uses `border-primary` shadow utility.
                await expect(
                    canvasElement.querySelector(
                        "input[type='checkbox'].border-primary"
                    )
                ).not.toBeNull();
            }
        );

        await step("typing updates the name input", async () => {
            // Labels are paired with inputs via htmlFor/id, so
            // findByLabelText resolves the input directly.
            const nameInput =
                await canvas.findByLabelText<HTMLInputElement>(/full name/i);
            await expect(nameInput).toHaveValue("Ada Lovelace");
            await userEvent.clear(nameInput);
            await userEvent.type(nameInput, "Margaret Hamilton");
            await waitFor(async () => {
                await expect(nameInput).toHaveValue("Margaret Hamilton");
            });
        });

        await step(
            "toggling Email notifications flips the checkbox state",
            async () => {
                const checkbox = canvas.getByRole<HTMLInputElement>(
                    "checkbox",
                    { name: /email notifications/i }
                );
                const initiallyChecked = checkbox.checked;
                await userEvent.click(checkbox);
                await waitFor(async () => {
                    await expect(checkbox.checked).toBe(!initiallyChecked);
                });
            }
        );

        await step("Role enum selects a different value", async () => {
            const select = canvas.getByRole<HTMLSelectElement>("combobox", {
                name: /role/i,
            });
            await expect(select.value).toBe("admin");
            await userEvent.selectOptions(select, "editor");
            await waitFor(async () => {
                await expect(select.value).toBe("editor");
            });
        });
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
                canvasElement.querySelectorAll(
                    "input.border-input, input.border-primary, select.border-input"
                )
            ).toHaveLength(0);
        });

        await step(
            "shadcn read-only text spans render every value",
            async () => {
                const readonlySpans =
                    canvasElement.querySelectorAll("span.text-sm");
                await expect(readonlySpans.length).toBeGreaterThan(0);
            }
        );

        await step("data values appear as text", async () => {
            await expect(canvas.getByText("Ada Lovelace")).toBeInTheDocument();
            await expect(canvas.getByText("admin")).toBeInTheDocument();
            // Boolean true renders as "Yes" via a span.text-sm.
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
            "nested Address group renders with an h3 heading",
            async () => {
                const heading = canvasElement.querySelector(
                    "h3.text-lg.font-medium"
                );
                if (heading === null) {
                    throw new Error("Expected an h3.text-lg.font-medium");
                }
                await expect(heading.textContent).toBe("Address");
            }
        );

        await step("nested fields are editable", async () => {
            const canvas = within(canvasElement);
            const streetInput =
                await canvas.findByLabelText<HTMLInputElement>(/street/i);
            const cityInput =
                await canvas.findByLabelText<HTMLInputElement>(/city/i);
            await expect(streetInput).toHaveValue("5 Devonshire Street");
            await expect(cityInput).toHaveValue("London");

            await userEvent.clear(streetInput);
            await userEvent.type(streetInput, "13 Albemarle Street");
            await waitFor(async () => {
                await expect(streetInput).toHaveValue("13 Albemarle Street");
            });
        });

        await step(
            "updating a nested field does not reset outer fields",
            async () => {
                const canvas = within(canvasElement);
                const outerName =
                    canvas.getByLabelText<HTMLInputElement>(/^name$/i);
                await expect(outerName).toHaveValue("Charles Babbage");

                const cityInput =
                    canvas.getByLabelText<HTMLInputElement>(/city/i);
                await expect(cityInput).toHaveValue("London");
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
        await expect(canvas.getByText("Charles Babbage")).toBeInTheDocument();
        await expect(
            canvas.getByText("5 Devonshire Street")
        ).toBeInTheDocument();
        await expect(canvas.getByText("London")).toBeInTheDocument();
        await expect(canvas.getByText("W1W 5HA")).toBeInTheDocument();
        // Nested heading still rendered in read-only nested view.
        const headings = canvasElement.querySelectorAll(
            "h3.text-lg.font-medium"
        );
        await expect(headings.length).toBeGreaterThanOrEqual(1);
    },
};
