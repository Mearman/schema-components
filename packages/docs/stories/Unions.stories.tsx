/**
 * Stories for union and discriminated union rendering.
 */
import type { Meta, StoryObj } from "@storybook/react";
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
    title: "React/Unions",
    component: SchemaComponent,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DiscriminatedUnionCard: Story = {
    args: {
        schema: paymentSchema,
        value: cardPayment,
    },
};

export const DiscriminatedUnionBank: Story = {
    args: {
        schema: paymentSchema,
        value: bankPayment,
    },
};

export const PlainUnion: Story = {
    args: {
        schema: searchSchema,
        value: searchData,
    },
};

export const PlainUnionReadOnly: Story = {
    args: {
        schema: searchSchema,
        value: searchData,
        readOnly: true,
    },
};
