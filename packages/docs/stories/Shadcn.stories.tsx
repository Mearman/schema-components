/**
 * Stories for the shadcn/ui theme adapter with Tailwind CSS.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
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
