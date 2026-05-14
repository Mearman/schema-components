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

const meta: Meta = {
    title: "Visibility & Ordering",
};
export default meta;

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export const AllFieldsVisible: StoryObj = {
    name: "All fields visible (default)",
    render: () => (
        <SchemaComponent schema={userSchema} value={value} readOnly />
    ),
};

export const HideRole: StoryObj = {
    name: "Hide role field",
    render: () => (
        <SchemaComponent
            schema={userSchema}
            value={value}
            readOnly
            fields={{ role: { visible: false } }}
        />
    ),
};

export const HideMultipleFields: StoryObj = {
    name: "Hide multiple fields",
    render: () => (
        <SchemaComponent
            schema={userSchema}
            value={value}
            readOnly
            fields={{ email: { visible: false }, active: { visible: false } }}
        />
    ),
};

export const ConditionalPayment: StoryObj = {
    name: "Conditional payment fields",
    render: () => (
        <SchemaComponent
            schema={paymentSchema}
            value={{
                method: "card",
                cardNumber: "4111 **** **** 1234",
                expiry: "12/28",
                accountNumber: "",
                sortCode: "",
            }}
            readOnly
            fields={{
                accountNumber: { visible: false },
                sortCode: { visible: false },
            }}
        />
    ),
};

export const ConditionalPaymentBank: StoryObj = {
    name: "Conditional payment fields (bank)",
    render: () => (
        <SchemaComponent
            schema={paymentSchema}
            value={{
                method: "bank",
                cardNumber: "",
                expiry: "",
                accountNumber: "12345678",
                sortCode: "00-00-00",
            }}
            readOnly
            fields={{
                cardNumber: { visible: false },
                expiry: { visible: false },
            }}
        />
    ),
};

export const HideInEditable: StoryObj = {
    name: "Hidden field in editable form",
    render: () => (
        <SchemaComponent
            schema={userSchema}
            value={value}
            fields={{ role: { visible: false } }}
        />
    ),
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

export const DefaultOrder: StoryObj = {
    name: "Default order (insertion)",
    render: () => (
        <SchemaComponent schema={contactSchema} value={contactValue} readOnly />
    ),
};

export const Reordered: StoryObj = {
    name: "Reordered fields",
    render: () => (
        <SchemaComponent
            schema={contactSchema}
            value={contactValue}
            readOnly
            fields={{
                phone: { order: 1 },
                email: { order: 2 },
                address: { order: 3 },
                name: { order: 4 },
            }}
        />
    ),
};

export const PartiallyOrdered: StoryObj = {
    name: "Partially ordered (email first, rest default)",
    render: () => (
        <SchemaComponent
            schema={contactSchema}
            value={contactValue}
            readOnly
            fields={{
                email: { order: 1 },
            }}
        />
    ),
};

// ---------------------------------------------------------------------------
// Combined: visibility + ordering
// ---------------------------------------------------------------------------

export const ReorderedWithHidden: StoryObj = {
    name: "Reordered with hidden field",
    render: () => (
        <SchemaComponent
            schema={contactSchema}
            value={contactValue}
            readOnly
            fields={{
                address: { order: 1 },
                name: { order: 2 },
                phone: { visible: false },
            }}
        />
    ),
};
