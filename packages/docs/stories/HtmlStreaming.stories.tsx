/**
 * Stories for HTML streaming renderers.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { renderToHtml } from "schema-components/html/renderToHtml";
import { renderToHtmlChunks } from "schema-components/html/renderToHtmlStream";

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

const largeSchema = z.object({
    id: z.string().meta({ description: "ID" }),
    name: z.string().meta({ description: "Name" }),
    email: z.email().meta({ description: "Email" }),
    phone: z.string().optional().meta({ description: "Phone" }),
    website: z.string().optional().meta({ description: "Website" }),
    company: z.string().optional().meta({ description: "Company" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
    bio: z.string().max(280).optional().meta({ description: "Bio" }),
    tags: z.array(z.string()).meta({ description: "Tags" }),
});

const largeData = {
    id: "usr_abc123",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+44 20 7946 0958",
    website: "https://example.com",
    company: "Analytical Engine Ltd",
    role: "admin" as const,
    active: true,
    bio: "Mathematician, first programmer.",
    tags: ["mathematics", "computing", "analytical engine"],
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function StreamingPreview({ chunks }: { chunks: string[] }) {
    return (
        <div>
            <div
                style={{
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    marginBottom: "0.5rem",
                }}
            >
                {chunks.length} chunks,{" "}
                {chunks.reduce((sum, c) => sum + c.length, 0)} bytes total
            </div>
            <div
                style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "0.375rem",
                    padding: "1rem",
                    background: "#fff",
                }}
                dangerouslySetInnerHTML={{
                    __html: chunks.join(""),
                }}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof StreamingPreview> = {
    title: "HTML/Streaming",
    component: StreamingPreview,
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const ChunkedEditable: Story = {
    args: {
        chunks: [...renderToHtmlChunks(userSchema, { value: userData })],
    },
};

export const ChunkedReadOnly: Story = {
    args: {
        chunks: [
            ...renderToHtmlChunks(userSchema, {
                value: userData,
                readOnly: true,
            }),
        ],
    },
};

export const ChunkedEquivalence: Story = {
    args: {
        chunks: (() => {
            const full = renderToHtml(userSchema, { value: userData });
            const streamed = [
                ...renderToHtmlChunks(userSchema, { value: userData }),
            ].join("");
            return [
                `<div style="margin-bottom:1rem;padding:0.5rem;border-radius:4px;background:${full === streamed ? "#d1fae5" : "#fee2e2"};font-size:0.875rem">`,
                `<strong>${full === streamed ? "✓ Output matches renderToHtml exactly" : "✗ Output differs"}</strong>`,
                `</div>`,
                ...renderToHtmlChunks(userSchema, { value: userData }),
            ];
        })(),
    },
};

export const LargeSchemaChunks: Story = {
    args: {
        chunks: [...renderToHtmlChunks(largeSchema, { value: largeData })],
    },
};

export const LargeSchemaReadOnlyChunks: Story = {
    args: {
        chunks: [
            ...renderToHtmlChunks(largeSchema, {
                value: largeData,
                readOnly: true,
            }),
        ],
    },
};
