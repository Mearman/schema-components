/**
 * Visibility and ordering stories.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const userSchema = z.object({
    name: z.string().meta({ description: "Name" }),
    email: z.email().meta({ description: "Email" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
});

const value = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin",
    active: true,
};

const paymentSchema = z.object({
    method: z.enum(["card", "bank"]).meta({ description: "Method" }),
    cardNumber: z.string().meta({ description: "Card number" }),
    expiry: z.string().meta({ description: "Expiry" }),
    accountNumber: z.string().meta({ description: "Account number" }),
    sortCode: z.string().meta({ description: "Sort code" }),
});

const meta = {
    title: "Objects & Layout/Visibility & Ordering",
    component: SchemaComponent,
    tags: ["editable", "readonly", "zod"],
} satisfies Meta<typeof SchemaComponent>;
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export const AllFieldsVisible: Story = {
    name: "All fields visible (default)",
    args: {
        schema: userSchema,
        value: value,
        readOnly: true,
    },
};

export const HideRole: Story = {
    name: "Hide role field",
    args: {
        schema: userSchema,
        value: value,
        readOnly: true,
        fields: { role: { visible: false } },
    },
};

export const HideMultipleFields: Story = {
    name: "Hide multiple fields",
    args: {
        schema: userSchema,
        value: value,
        readOnly: true,
        fields: { email: { visible: false }, active: { visible: false } },
    },
};

export const ConditionalPayment: Story = {
    name: "Conditional payment fields",
    args: {
        schema: paymentSchema,
        value: {
            method: "card",
            cardNumber: "4111 **** **** 1234",
            expiry: "12/28",
            accountNumber: "",
            sortCode: "",
        },
        readOnly: true,
        fields: {
            accountNumber: { visible: false },
            sortCode: { visible: false },
        },
    },
};

export const ConditionalPaymentBank: Story = {
    name: "Conditional payment fields (bank)",
    args: {
        schema: paymentSchema,
        value: {
            method: "bank",
            cardNumber: "",
            expiry: "",
            accountNumber: "12345678",
            sortCode: "00-00-00",
        },
        readOnly: true,
        fields: {
            cardNumber: { visible: false },
            expiry: { visible: false },
        },
    },
};

export const HideInEditable: Story = {
    name: "Hidden field in editable form",
    args: {
        schema: userSchema,
        value: value,
        fields: { role: { visible: false } },
    },
};

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const contactSchema = z.object({
    name: z.string().meta({ description: "Name" }),
    email: z.email().meta({ description: "Email" }),
    phone: z.string().meta({ description: "Phone" }),
    address: z.string().meta({ description: "Address" }),
});

const contactValue = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+44 20 7946 0958",
    address: "17 Bond Street, London",
};

export const DefaultOrder: Story = {
    name: "Default order (insertion)",
    args: {
        schema: contactSchema,
        value: contactValue,
        readOnly: true,
    },
};

export const Reordered: Story = {
    name: "Reordered fields",
    args: {
        schema: contactSchema,
        value: contactValue,
        readOnly: true,
        fields: {
            phone: { order: 1 },
            email: { order: 2 },
            address: { order: 3 },
            name: { order: 4 },
        },
    },
};

export const PartiallyOrdered: Story = {
    name: "Partially ordered (email first, rest default)",
    args: {
        schema: contactSchema,
        value: contactValue,
        readOnly: true,
        fields: {
            email: { order: 1 },
        },
    },
};

// ---------------------------------------------------------------------------
// Combined: visibility + ordering
// ---------------------------------------------------------------------------

export const ReorderedWithHidden: Story = {
    name: "Reordered with hidden field",
    args: {
        schema: contactSchema,
        value: contactValue,
        readOnly: true,
        fields: {
            address: { order: 1 },
            name: { order: 2 },
            phone: { visible: false },
        },
    },
};
