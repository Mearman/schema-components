/**
 * Stories for union and discriminated union rendering.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const paymentSchema = z.discriminatedUnion("method", [
    z.object({
        method: z.literal("card").meta({ description: "Method" }),
        cardNumber: z.string().meta({ description: "Card number" }),
        expiry: z.string().meta({ description: "Expiry" }),
    }),
    z.object({
        method: z.literal("bank").meta({ description: "Method" }),
        accountNumber: z.string().meta({ description: "Account number" }),
        sortCode: z.string().meta({ description: "Sort code" }),
    }),
]);

const cardPayment = {
    method: "card" as const,
    cardNumber: "4111111111111111",
    expiry: "12/28",
};

const bankPayment = {
    method: "bank" as const,
    accountNumber: "12345678",
    sortCode: "12-34-56",
};

const searchSchema = z.object({
    query: z
        .union([z.string(), z.number()])
        .meta({ description: "Search query" }),
    scope: z
        .union([z.literal("all"), z.literal("open"), z.literal("closed")])
        .meta({
            description: "Scope",
        }),
});

const searchData = {
    query: "Ada",
    scope: "all" as const,
};

const meta: Meta<typeof SchemaComponent> = {
    title: "Extensibility/Unions",
    component: SchemaComponent,
    tags: ["union", "editable", "zod"],
    argTypes: {
        readOnly: {
            control: "boolean",
            description: "Render union variants as formatted text.",
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DiscriminatedUnionCard: Story = {
    args: {
        schema: paymentSchema,
        value: cardPayment,
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "the card variant exposes its discriminator value and card-specific inputs",
            async () => {
                await expect(
                    canvas.getByDisplayValue("4111111111111111")
                ).toBeInTheDocument();
                await expect(
                    canvas.getByDisplayValue("12/28")
                ).toBeInTheDocument();
            }
        );
    },
};

export const DiscriminatedUnionBank: Story = {
    args: {
        schema: paymentSchema,
        value: bankPayment,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue("12345678")).toBeInTheDocument();
        await expect(canvas.getByDisplayValue("12-34-56")).toBeInTheDocument();
    },
};

export const PlainUnion: Story = {
    args: {
        schema: searchSchema,
        value: searchData,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // The string|number union renders the seeded query value.
        await expect(canvas.getByDisplayValue("Ada")).toBeInTheDocument();
    },
};

export const PlainUnionReadOnly: Story = {
    args: {
        schema: searchSchema,
        value: searchData,
        readOnly: true,
    },
    tags: ["union", "readonly", "zod"],
};
