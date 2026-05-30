import { z } from "zod";
import {
    profileSchema,
    profileData,
    kitchenSinkSchema,
    kitchenSinkData,
    discriminatedUnionSchema,
    discriminatedUnionData,
    complexOpenApiSpec,
} from "./schemas.ts";

export type ZodExample = {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly format: "zod";
    readonly schema: z.ZodTypeAny;
    readonly data: unknown;
};

export type OpenApiExample = {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly format: "openapi";
    readonly spec: unknown;
    readonly ref: string;
    readonly data: Record<string, unknown>;
};

export type Example = ZodExample | OpenApiExample;

export const EXAMPLES: readonly Example[] = [
    {
        id: "profile",
        name: "Profile",
        description:
            "A simple flat object — name, email, age, role, active status, and bio.",
        format: "zod",
        schema: profileSchema,
        data: profileData,
    },
    {
        id: "kitchen-sink",
        name: "Kitchen sink",
        description:
            "Every supported feature — defaults, readOnly/writeOnly, formats, nested objects, arrays, and records.",
        format: "zod",
        schema: kitchenSinkSchema,
        data: kitchenSinkData,
    },
    {
        id: "discriminated-union",
        name: "Discriminated union",
        description:
            "Payment method selection via discriminatedUnion('kind', ...) — card or bank.",
        format: "zod",
        schema: discriminatedUnionSchema,
        data: discriminatedUnionData,
    },
    {
        id: "orders-api",
        name: "Orders API",
        description:
            "A full OpenAPI 3.1 document with two operations and three component schemas.",
        format: "openapi",
        spec: complexOpenApiSpec,
        ref: "#/components/schemas/Order",
        data: {
            id: "ord_001",
            status: "pending",
            total: 42.5,
            customerEmail: "ada@example.com",
        },
    },
];

export {
    profileSchema,
    profileData,
    addressSchema,
    kitchenSinkSchema,
    kitchenSinkData,
    discriminatedUnionSchema,
    discriminatedUnionData,
    complexOpenApiSpec,
} from "./schemas.ts";
