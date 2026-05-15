/**
 * Stories for the HTML renderer — renderToHtml with h() builder output.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { renderToHtml } from "schema-components/html/renderToHtml";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const userSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
});

const userData = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin" as const,
    active: true,
};

const nestedSchema = z.object({
    name: z.string().meta({ description: "Name" }),
    address: z
        .object({
            street: z.string().meta({ description: "Street" }),
            city: z.string().meta({ description: "City" }),
        })
        .meta({ description: "Address" }),
});

const nestedData = {
    name: "Ada",
    address: { street: "17 Doubting Street", city: "London" },
};

const arraySchema = z.object({
    tags: z.array(z.string()).meta({ description: "Tags" }),
});

const arrayData = { tags: ["mathematics", "computing", "analytical engine"] };

const constrainedSchema = z.object({
    username: z.string().min(3).max(20).meta({ description: "Username" }),
    age: z.number().min(0).max(150).meta({ description: "Age" }),
});

const constrainedData = { username: "ada", age: 36 };

// ---------------------------------------------------------------------------
// Helper component — renders HTML string in an iframe-like container
// ---------------------------------------------------------------------------

function HtmlPreview({ html }: { html: string }) {
    return (
        <div
            style={{
                border: "1px solid #e2e8f0",
                borderRadius: "0.375rem",
                padding: "1rem",
                background: "#fff",
            }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

// ---------------------------------------------------------------------------
// Story metadata
// ---------------------------------------------------------------------------

const meta: Meta<typeof HtmlPreview> = {
    title: "HTML Rendering/Static",
    component: HtmlPreview,
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const EditableForm: Story = {
    args: {
        html: renderToHtml(userSchema, { value: userData }),
    },
};

export const ReadOnlyDisplay: Story = {
    args: {
        html: renderToHtml(userSchema, { value: userData, readOnly: true }),
    },
};

export const NestedEditable: Story = {
    args: {
        html: renderToHtml(nestedSchema, { value: nestedData }),
    },
};

export const NestedReadOnly: Story = {
    args: {
        html: renderToHtml(nestedSchema, { value: nestedData, readOnly: true }),
    },
};

export const ArrayEditable: Story = {
    args: {
        html: renderToHtml(arraySchema, { value: arrayData }),
    },
};

export const ArrayReadOnly: Story = {
    args: {
        html: renderToHtml(arraySchema, { value: arrayData, readOnly: true }),
    },
};

export const ConstrainedFields: Story = {
    args: {
        html: renderToHtml(constrainedSchema, { value: constrainedData }),
    },
};

export const WithStylesheet: Story = {
    args: {
        html: `<link rel="stylesheet" href="/html/styles.css">${renderToHtml(constrainedSchema, { value: constrainedData })}`,
    },
};
