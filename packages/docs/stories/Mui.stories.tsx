/**
 * Stories for the MUI theme adapter with real Material UI components.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { muiResolver } from "schema-components/themes/mui";

import "../src/mui-setup.ts";

const theme = createTheme({
    palette: {
        mode: "light",
    },
});

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
};

export default meta;
type Story = StoryObj<typeof MuiPreview>;

export const EditableProfile: Story = {
    args: {
        schema: profileSchema,
        data: initialProfile,
        readOnly: false,
    },
};

export const ReadOnlyProfile: Story = {
    args: {
        schema: profileSchema,
        data: initialProfile,
        readOnly: true,
    },
};

export const NestedEditable: Story = {
    args: {
        schema: nestedSchema,
        data: nestedData,
        readOnly: false,
    },
};

export const NestedReadOnly: Story = {
    args: {
        schema: nestedSchema,
        data: nestedData,
        readOnly: true,
    },
};
