/**
 * Stories for the Mantine theme adapter with real Mantine components.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
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
