/**
 * Stories for the MUI theme adapter with real Material UI components.
 */
import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { z } from "zod";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { muiResolver } from "schema-components/themes/mui";

import "../src/mui-setup.ts";
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
    name: "Grace Hopper",
    email: "grace@navy.mil",
    role: "admin" as const,
    active: true,
    bio: "Computer scientist and United States Navy rear admiral.",
};

const nestedData = {
    name: "Ada Lovelace",
    address: {
        street: "12 St James's Square",
        city: "London",
        postcode: "SW1Y 4JH",
    },
};

function MuiPreview({
    schema,
    data,
    readOnly,
}: {
    schema: z.ZodType;
    data: unknown;
    readOnly: boolean;
}) {
    const [value, setValue] = useState<unknown>(data);
    const mode = useThemeClass();
    const theme = useMemo(() => createTheme({ palette: { mode } }), [mode]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <SchemaProvider resolver={muiResolver}>
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
        </ThemeProvider>
    );
}

const meta: Meta<typeof MuiPreview> = {
    title: "Theme Adapters/MUI",
    component: MuiPreview,
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
type Story = StoryObj<typeof MuiPreview>;

export const EditableProfile: Story = {
    args: {
        schema: profileSchema,
        data: initialProfile,
        readOnly: false,
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);

        await step(
            "MUI components render (not the headless fallback)",
            async () => {
                await expect(
                    canvasElement.querySelectorAll(".MuiTextField-root").length
                ).toBeGreaterThan(0);
                await expect(
                    canvasElement.querySelectorAll(".MuiOutlinedInput-root")
                        .length
                ).toBeGreaterThan(0);
                await expect(
                    canvasElement.querySelector(".MuiCheckbox-root")
                ).not.toBeNull();
                await expect(
                    canvasElement.querySelector(".MuiSelect-root")
                ).not.toBeNull();
            }
        );

        await step("typing updates the name field value", async () => {
            const nameInput = await canvas.findByRole<HTMLInputElement>(
                "textbox",
                { name: /full name/i }
            );
            await userEvent.clear(nameInput);
            await userEvent.type(nameInput, "Margaret Hamilton");
            await waitFor(async () => {
                await expect(nameInput).toHaveValue("Margaret Hamilton");
            });
        });

        await step("toggling Active flips the checkbox state", async () => {
            const activeCheckbox = canvas.getByRole<HTMLInputElement>(
                "checkbox",
                { name: /active/i }
            );
            const initiallyChecked = activeCheckbox.checked;
            await userEvent.click(activeCheckbox);
            await waitFor(async () => {
                await expect(activeCheckbox.checked).toBe(!initiallyChecked);
            });
        });

        await step("Role enum renders as an MUI combobox", async () => {
            const roleCombobox = await canvas.findByRole("combobox", {
                name: /role/i,
            });
            // MUI's TextField with `select` exposes a combobox whose text node
            // mirrors the current value.
            await expect(roleCombobox).toHaveTextContent("admin");
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
        });

        await step("MUI Typography is used for read-only display", async () => {
            const typographies = canvasElement.querySelectorAll(
                ".MuiTypography-root.MuiTypography-body2"
            );
            await expect(typographies.length).toBeGreaterThan(0);
        });

        await step("data values appear as text", async () => {
            await expect(canvas.getByText("Grace Hopper")).toBeInTheDocument();
            await expect(
                canvas.getByText("grace@navy.mil")
            ).toBeInTheDocument();
            await expect(canvas.getByText("admin")).toBeInTheDocument();
            // Boolean true renders as "Yes" via MuiTypography.
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

        await step("nested Address group renders with heading", async () => {
            // Object containers emit an h6 Typography from the description.
            const heading = canvasElement.querySelector("h6.MuiTypography-h6");
            await expect(heading).not.toBeNull();
            await expect(heading?.textContent).toBe("Address");
        });

        await step("nested fields are editable", async () => {
            const streetInput = await canvas.findByRole<HTMLInputElement>(
                "textbox",
                { name: /street/i }
            );
            const cityInput = await canvas.findByRole<HTMLInputElement>(
                "textbox",
                { name: /city/i }
            );
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
                const outerName = canvas.getByRole<HTMLInputElement>(
                    "textbox",
                    { name: /^name$/i }
                );
                // Outer name should still hold its original value after the
                // nested edit above.
                await expect(outerName).toHaveValue("Ada Lovelace");

                const cityInput = canvas.getByRole<HTMLInputElement>(
                    "textbox",
                    { name: /city/i }
                );
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
    },
};
