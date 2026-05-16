/**
 * Stories for multi-version JSON Schema: Draft 04, 06, 07, 2019-09, 2020-12.
 * Demonstrates version-specific features and normalisation.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const meta: Meta<typeof SchemaComponent> = {
    title: "JSON Schema/Draft Versions",
    component: SchemaComponent,
};
export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Draft 04: exclusiveMinimum as boolean, id → $id
// ---------------------------------------------------------------------------

const draft04Schema = {
    $schema: "http://json-schema.org/draft-04/schema#",
    type: "object" as const,
    properties: {
        id: { type: "integer" as const, description: "ID", minimum: 1 },
        score: {
            type: "number" as const,
            description: "Score (exclusive min 0)",
            minimum: 0,
            exclusiveMinimum: true,
        },
        grade: {
            type: "string" as const,
            description: "Grade",
            enum: ["A", "B", "C", "D", "F"],
        },
    },
    required: ["id"],
} as const;

export const Draft04: Story = {
    args: {
        schema: draft04Schema,
        value: { id: 1, score: 0.5, grade: "A" },
    },
};

// ---------------------------------------------------------------------------
// Draft 07: examples, contentEncoding, contentMediaType
// ---------------------------------------------------------------------------

const draft07Schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object" as const,
    properties: {
        username: {
            type: "string" as const,
            description: "Username",
            examples: ["ada", "grace"],
        },
        avatar: {
            type: "string" as const,
            description: "Base64-encoded avatar",
            contentEncoding: "base64",
            contentMediaType: "image/png",
        },
        age: {
            type: "integer" as const,
            description: "Age",
            exclusiveMinimum: 0,
            maximum: 150,
        },
    },
    required: ["username"],
} as const;

export const Draft07: Story = {
    args: {
        schema: draft07Schema,
        value: { username: "ada", age: 36 },
    },
};

// ---------------------------------------------------------------------------
// Draft 2019-09: $recursiveRef
// ---------------------------------------------------------------------------

const draft201909Schema = {
    $schema: "https://json-schema.org/draft/2019-09/schema",
    $recursiveAnchor: true,
    type: "object" as const,
    properties: {
        label: { type: "string" as const, description: "Label" },
        children: {
            type: "array" as const,
            description: "Children",
            items: { $recursiveRef: "#" },
        },
    },
    required: ["label"],
} as const;

export const Draft201909: Story = {
    args: {
        schema: draft201909Schema,
        value: {
            label: "Root",
            children: [
                { label: "Child A" },
                { label: "Child B", children: [{ label: "Grandchild" }] },
            ],
        },
    },
};

// ---------------------------------------------------------------------------
// Draft 2020-12: $dynamicRef, prefixItems, contains
// ---------------------------------------------------------------------------

const draft202012Schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $dynamicAnchor: "Node",
    type: "object" as const,
    properties: {
        name: { type: "string" as const, description: "Name" },
        tags: {
            type: "array" as const,
            description: "Tags",
            contains: { type: "string" as const },
            minContains: 1,
        },
        point: {
            type: "array" as const,
            description: "Coordinate",
            prefixItems: [
                { type: "number" as const, description: "X" },
                { type: "number" as const, description: "Y" },
            ],
        },
        child: {
            $dynamicRef: "#Node",
            description: "Child node",
        },
    },
    required: ["name"],
} as const;

export const Draft202012: Story = {
    args: {
        schema: draft202012Schema,
        value: {
            name: "Root",
            tags: ["important", "active"],
            point: [1.5, -3.2],
            child: { name: "Nested", tags: ["inner"] },
        },
    },
};
