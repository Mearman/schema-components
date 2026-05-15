/**
 * SchemaView stories — read-only server component rendering.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { z } from "zod";
import { SchemaView } from "schema-components/react/SchemaView";

const userSchema = z.object({
    name: z.string().meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email" }),
    role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
    active: z.boolean().meta({ description: "Active" }),
});

const addressSchema = z.object({
    street: z.string().meta({ description: "Street" }),
    city: z.string().meta({ description: "City" }),
    postcode: z.string().meta({ description: "Postcode" }),
    country: z.string().meta({ description: "Country" }),
});

const nestedSchema = z.object({
    name: z.string().meta({ description: "Name" }),
    address: addressSchema.meta({ description: "Address" }),
});

const user = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin",
    active: true,
};

const meta: Meta = {
    title: "Server Rendering/SchemaView",
};
export default meta;

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

export const BasicObject: StoryObj = {
    name: "Object with primitives",
    render: () => <SchemaView schema={userSchema} value={user} />,
};

export const NestedObject: StoryObj = {
    name: "Nested object",
    render: () => (
        <SchemaView
            schema={nestedSchema}
            value={{
                name: "Ada",
                address: {
                    street: "17 Bond Street",
                    city: "London",
                    postcode: "W1S 4SQ",
                    country: "United Kingdom",
                },
            }}
        />
    ),
};

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

export const EmptyValues: StoryObj = {
    name: "Missing / empty values",
    render: () => (
        <SchemaView
            schema={userSchema}
            value={{
                name: "",
                email: undefined,
                role: "viewer",
                active: false,
            }}
        />
    ),
};

export const NoValue: StoryObj = {
    name: "No value prop",
    render: () => <SchemaView schema={userSchema} />,
};

// ---------------------------------------------------------------------------
// JSON Schema input
// ---------------------------------------------------------------------------

const jsonSchema = {
    type: "object" as const,
    properties: {
        title: { type: "string" as const, description: "Title" },
        count: { type: "number" as const, description: "Count" },
    },
    required: ["title"],
} as const;

export const JsonSchemaInput: StoryObj = {
    name: "JSON Schema input",
    render: () => (
        <SchemaView schema={jsonSchema} value={{ title: "Hello", count: 42 }} />
    ),
};

// ---------------------------------------------------------------------------
// Array
// ---------------------------------------------------------------------------

const arraySchema = z.object({
    tags: z.array(z.string()).meta({ description: "Tags" }),
});

export const WithArray: StoryObj = {
    name: "Array field",
    render: () => (
        <SchemaView
            schema={arraySchema}
            value={{ tags: ["react", "zod", "typescript"] }}
        />
    ),
};

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

const paymentSchema = z.discriminatedUnion("method", [
    z.object({
        method: z.literal("card"),
        cardNumber: z.string().meta({ description: "Card number" }),
        expiry: z.string().meta({ description: "Expiry" }),
    }),
    z.object({
        method: z.literal("bank"),
        accountNumber: z.string().meta({ description: "Account number" }),
        sortCode: z.string().meta({ description: "Sort code" }),
    }),
]);

export const DiscriminatedUnion: StoryObj = {
    name: "Discriminated union",
    render: () => (
        <SchemaView
            schema={paymentSchema}
            value={{
                method: "card",
                cardNumber: "4111 **** **** 1234",
                expiry: "12/28",
            }}
        />
    ),
};
