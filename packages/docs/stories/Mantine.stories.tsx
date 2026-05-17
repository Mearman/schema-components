/**
 * Stories for the Mantine theme adapter with real Mantine components.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";
import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { mantineResolver } from "schema-components/themes/mantine";

import "../src/mantine-setup.ts";
import { useThemeClass } from "../src/useThemeClass.ts";

const mantineTheme = createTheme({});

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
    name: "Alan Turing",
    email: "alan@example.com",
    role: "admin" as const,
    active: true,
    bio: "Mathematician, computer scientist, and cryptanalyst.",
};

const nestedData = {
    name: "Ada Lovelace",
    address: {
        street: "12 St James's Square",
        city: "London",
        postcode: "SW1Y 4JH",
    },
};

function MantinePreview({
    schema,
    data,
    readOnly,
}: {
    schema: z.ZodType;
    data: unknown;
    readOnly: boolean;
}) {
    const [value, setValue] = useState<unknown>(data);
    const colorScheme = useThemeClass();

    return (
        <MantineProvider theme={mantineTheme} forceColorScheme={colorScheme}>
            <SchemaProvider resolver={mantineResolver}>
                <div style={{ maxWidth: "36rem" }}>
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
        </MantineProvider>
    );
}

const meta: Meta<typeof MantinePreview> = {
    title: "Theme Adapters/Mantine",
    component: MantinePreview,
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
type Story = StoryObj<typeof MantinePreview>;

export const EditableProfile: Story = {
    args: {
        schema: profileSchema,
        data: initialProfile,
        readOnly: false,
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);

        await step(
            "Mantine components render (not the headless fallback)",
            async () => {
                await expect(
                    canvasElement.querySelectorAll(".mantine-TextInput-root")
                        .length
                ).toBeGreaterThan(0);
                await expect(
                    canvasElement.querySelector(".mantine-Select-root")
                ).not.toBeNull();
                await expect(
                    canvasElement.querySelector(".mantine-Switch-root")
                ).not.toBeNull();
                await expect(
                    canvasElement.querySelector(".mantine-Fieldset-root")
                ).not.toBeNull();
            }
        );

        await step("typing updates the name field value", async () => {
            const nameInput =
                await canvas.findByLabelText<HTMLInputElement>(/full name/i);
            await userEvent.clear(nameInput);
            await userEvent.type(nameInput, "Margaret Hamilton");
            await waitFor(async () => {
                await expect(nameInput).toHaveValue("Margaret Hamilton");
            });
        });

        await step("toggling Active flips the Switch state", async () => {
            const activeSwitch = canvas.getByRole<HTMLInputElement>("switch", {
                name: /active/i,
            });
            const initiallyChecked = activeSwitch.checked;
            await userEvent.click(activeSwitch);
            await waitFor(async () => {
                await expect(activeSwitch.checked).toBe(!initiallyChecked);
            });
        });

        await step(
            "Role enum renders the Mantine Select with current value",
            async () => {
                const selectInput =
                    canvasElement.querySelector<HTMLInputElement>(
                        ".mantine-Select-input"
                    );
                if (selectInput === null) {
                    throw new Error("Expected a .mantine-Select-input element");
                }
                await expect(selectInput.value).toBe("admin");
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
            await expect(canvas.queryAllByRole("switch")).toHaveLength(0);
            await expect(canvas.queryAllByRole("combobox")).toHaveLength(0);
        });

        await step(
            "the outer Mantine Fieldset still wraps the read-only view",
            async () => {
                // The mantineResolver's object renderer always emits a Fieldset,
                // even in read-only mode — string/enum/boolean fields fall back
                // to bare <span> elements rather than a Mantine Text variant.
                await expect(
                    canvasElement.querySelector(".mantine-Fieldset-root")
                ).not.toBeNull();
            }
        );

        await step("data values appear as text", async () => {
            await expect(canvas.getByText("Alan Turing")).toBeInTheDocument();
            await expect(
                canvas.getByText("alan@example.com")
            ).toBeInTheDocument();
            await expect(canvas.getByText("admin")).toBeInTheDocument();
            // Boolean true renders as "Yes" via a plain <span> (no Mantine
            // typography equivalent for read-only form values).
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
        const canvas = within(canvasElement);

        await step(
            "nested Address group renders as a nested Fieldset",
            async () => {
                const fieldsets = canvasElement.querySelectorAll(
                    ".mantine-Fieldset-root"
                );
                await expect(fieldsets.length).toBeGreaterThanOrEqual(2);
                const legend = canvasElement.querySelector(
                    ".mantine-Fieldset-legend"
                );
                await expect(legend).not.toBeNull();
                await expect(legend?.textContent).toBe("Address");
            }
        );

        await step("nested fields are editable", async () => {
            const streetInput =
                await canvas.findByLabelText<HTMLInputElement>(/street/i);
            const cityInput =
                await canvas.findByLabelText<HTMLInputElement>(/city/i);
            await expect(streetInput).toHaveValue("12 St James's Square");
            await expect(cityInput).toHaveValue("London");

            await userEvent.clear(streetInput);
            await userEvent.type(streetInput, "221B Baker Street");
            await waitFor(async () => {
                await expect(streetInput).toHaveValue("221B Baker Street");
            });
        });

        await step(
            "updating a nested field does not reset outer fields",
            async () => {
                const outerName =
                    canvas.getByLabelText<HTMLInputElement>(/^name$/i);
                await expect(outerName).toHaveValue("Ada Lovelace");

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
        await expect(canvas.getByText("Ada Lovelace")).toBeInTheDocument();
        await expect(
            canvas.getByText("12 St James's Square")
        ).toBeInTheDocument();
        await expect(canvas.getByText("London")).toBeInTheDocument();
        await expect(canvas.getByText("SW1Y 4JH")).toBeInTheDocument();
        // Nested Fieldset preserved in read-only nested view too.
        await expect(
            canvasElement.querySelectorAll(".mantine-Fieldset-root").length
        ).toBeGreaterThanOrEqual(2);
    },
};
