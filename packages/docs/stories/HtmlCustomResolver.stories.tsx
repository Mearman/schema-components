/**
 * Stories for custom HTML resolvers.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { renderToHtml } from "schema-components/html/renderToHtml";
import type { HtmlResolver } from "schema-components/core/renderer";

const cardSchema = z.object({
    title: z.string().meta({ description: "Title" }),
    price: z.number().meta({ description: "Price" }),
    available: z.boolean().meta({ description: "Available" }),
    category: z
        .enum(["book", "game", "course"])
        .meta({ description: "Category" }),
});

const cardData = {
    title: "Analytical Engine Handbook",
    price: 24.99,
    available: true,
    category: "book" as const,
};

const highlightResolver: HtmlResolver = {
    string: (props) => {
        if (props.readOnly) {
            return `<span class="sc-value sc-value--highlight">${typeof props.value === "string" ? props.value : ""}</span>`;
        }
        return renderToHtml(z.string(), { value: props.value });
    },
    number: (props) => {
        if (props.readOnly) {
            return `<strong class="sc-value">${typeof props.value === "number" ? props.value.toFixed(2) : "—"}</strong>`;
        }
        return renderToHtml(z.number(), { value: props.value });
    },
};

function HtmlPreview({ html }: { html: string }) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

const meta: Meta<typeof HtmlPreview> = {
    title: "HTML Rendering/Custom Resolver",
    component: HtmlPreview,
    tags: ["html"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        html: renderToHtml(cardSchema, { value: cardData, readOnly: true }),
    },
};

export const CustomResolver: Story = {
    args: {
        html: renderToHtml(cardSchema, {
            value: cardData,
            readOnly: true,
            resolver: highlightResolver,
        }),
    },
};

export const EditableCustomResolver: Story = {
    args: {
        html: renderToHtml(cardSchema, {
            value: cardData,
            resolver: highlightResolver,
        }),
    },
};
