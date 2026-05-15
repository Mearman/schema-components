/**
 * Stories for the Radix Themes adapter with real Radix components.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { Card, Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { radixResolver } from "schema-components/themes/radix";

import "../src/radix-setup.ts";

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

    return (
        <Theme appearance="light" accentColor="blue" radius="medium">
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
    title: "React/Radix",
    component: RadixPreview,
};

export default meta;
type Story = StoryObj<typeof RadixPreview>;

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
