import { z } from "zod";

export const profileSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name", order: 1 }),
    email: z.email().meta({ description: "Email address", order: 2 }),
    website: z.string().meta({ description: "Website", order: 3 }),
    age: z.number().min(18).max(130).meta({ description: "Age", order: 4 }),
    role: z
        .enum(["admin", "editor", "viewer"])
        .meta({ description: "Role", order: 5 }),
    active: z.boolean().meta({ description: "Active", order: 6 }),
    bio: z
        .string()
        .max(280)
        .optional()
        .meta({ description: "Bio", order: 7 }),
});

export const profileData = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    website: "https://example.com",
    age: 36,
    role: "admin" as const,
    active: true,
    bio: "Mathematician and first programmer.",
};

export const addressSchema = z.object({
    street: z.string().meta({ description: "Street", order: 1 }),
    city: z.string().meta({ description: "City", order: 2 }),
    postcode: z.string().meta({ description: "Postcode", order: 3 }),
});

export const kitchenSinkSchema = z.object({
    id: z
        .string()
        .default("usr_abc123")
        .meta({ description: "Identifier", readOnly: true, order: 1 }),
    name: z.string().min(1).meta({ description: "Full name", order: 2 }),
    email: z.email().meta({ description: "Email address", order: 3 }),
    password: z
        .string()
        .min(12)
        .meta({ description: "Password", writeOnly: true, order: 4 }),
    dateOfBirth: z
        .string()
        .meta({ description: "Date of birth", format: "date", order: 5 }),
    preferredTime: z
        .string()
        .meta({ description: "Preferred contact time", format: "time", order: 6 }),
    score: z.number().min(0).max(100).default(75).meta({ description: "Score", order: 7 }),
    active: z.boolean().default(true).meta({ description: "Active", order: 8 }),
    role: z
        .enum(["admin", "editor", "viewer"])
        .default("viewer")
        .meta({ description: "Role", order: 9 }),
    address: addressSchema.meta({ description: "Address", order: 10 }),
    tags: z.array(z.string()).meta({ description: "Tags", order: 11 }),
    preferences: z
        .record(z.string(), z.boolean())
        .meta({ description: "Preferences", order: 12 }),
    billingAddress: addressSchema.meta({
        description: "Billing address",
        order: 13,
        visible: false,
    }),
});

export const kitchenSinkData = {
    id: "usr_abc123",
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "correct-horse-battery-staple",
    dateOfBirth: "1815-12-10",
    preferredTime: "09:30",
    score: 98,
    active: true,
    role: "admin" as const,
    address: {
        street: "12 St James's Square",
        city: "London",
        postcode: "SW1Y 4JH",
    },
    tags: ["mathematics", "computing", "analytical engine"],
    preferences: {
        email: true,
        sms: false,
    },
    billingAddress: {
        street: "Hidden Street",
        city: "Hidden City",
        postcode: "H1 1DN",
    },
};

export const discriminatedUnionSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("card").meta({ description: "Kind" }),
        cardNumber: z.string().meta({ description: "Card number" }),
        expiry: z.string().meta({ description: "Expiry" }),
    }),
    z.object({
        kind: z.literal("bank").meta({ description: "Kind" }),
        accountNumber: z.string().meta({ description: "Account number" }),
        sortCode: z.string().meta({ description: "Sort code" }),
    }),
]);

export const discriminatedUnionData = {
    kind: "card" as const,
    cardNumber: "4111111111111111",
    expiry: "12/30",
};

export const complexOpenApiSpec = {
    openapi: "3.1.0",
    info: { title: "Orders API", version: "1.0.0" },
    paths: {
        "/orders/{orderId}": {
            parameters: [
                {
                    name: "orderId",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                },
            ],
            get: {
                summary: "Get an order",
                parameters: [
                    {
                        name: "include",
                        in: "query",
                        schema: {
                            type: "string",
                            enum: ["items", "customer", "events"],
                        },
                    },
                ],
                responses: {
                    "200": {
                        description: "Order found",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/Order" },
                            },
                            "text/plain": {
                                schema: { type: "string" },
                            },
                        },
                    },
                    "404": {
                        description: "Order not found",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/Error" },
                            },
                        },
                    },
                },
            },
            put: {
                summary: "Update an order",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OrderUpdate" },
                        },
                        "application/x-www-form-urlencoded": {
                            schema: { $ref: "#/components/schemas/OrderUpdate" },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Updated order",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/Order" },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            Order: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    status: {
                        type: "string",
                        enum: ["pending", "paid", "fulfilled"],
                    },
                    total: { type: "number", minimum: 0 },
                    customerEmail: { type: "string", format: "email" },
                },
                required: ["id", "status", "total"],
            },
            OrderUpdate: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        enum: ["pending", "paid", "fulfilled"],
                    },
                    customerEmail: { type: "string", format: "email" },
                },
            },
            Error: {
                type: "object",
                properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                },
                required: ["code", "message"],
            },
        },
    },
} as const;
