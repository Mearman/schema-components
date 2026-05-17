import type { Meta, StoryObj } from "@storybook/react";
import { linkTo } from "@storybook/addon-links";
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import {
    discriminatedUnionData,
    discriminatedUnionSchema,
} from "../src/demo-schemas.ts";
import {
    DemoCard,
    DemoGrid,
    StoryPage,
    StorySection,
} from "../src/story-layout.tsx";

const requiredSchema = z.object({
    name: z.string().min(1).meta({ description: "Full name" }),
    email: z.email().meta({ description: "Email address" }),
});

const editabilitySchema = z.object({
    id: z.string().meta({ description: "Identifier", readOnly: true }),
    password: z.string().meta({ description: "Password", writeOnly: true }),
    active: z.boolean().meta({ description: "Active" }),
});

function AccessibilityMatrix() {
    return (
        <StoryPage
            title="Accessibility matrix"
            description="Focused fixtures for labels, required fields, read-only/write-only semantics, and tabbed discriminated unions. Storybook a11y checks run against these stories."
        >
            <StorySection title="Labels and required fields">
                <DemoCard>
                    <SchemaComponent
                        schema={requiredSchema}
                        value={{ name: "Ada", email: "ada@example.com" }}
                    />
                </DemoCard>
            </StorySection>
            <StorySection title="Read-only and write-only fields">
                <DemoCard>
                    <SchemaComponent
                        schema={editabilitySchema}
                        value={{
                            id: "usr_123",
                            password: "secret",
                            active: true,
                        }}
                    />
                </DemoCard>
            </StorySection>
            <StorySection title="Discriminated union tabs">
                <DemoGrid>
                    <DemoCard title="Editable">
                        <SchemaComponent
                            schema={discriminatedUnionSchema}
                            value={discriminatedUnionData}
                        />
                    </DemoCard>
                    <DemoCard title="Read-only">
                        <SchemaComponent
                            schema={discriminatedUnionSchema}
                            value={discriminatedUnionData}
                            readOnly
                        />
                    </DemoCard>
                </DemoGrid>
            </StorySection>
            <div style={{ marginTop: "1rem" }}>
                <button
                    type="button"
                    onClick={linkTo("Editability/Overview", "Editable")}
                    style={{
                        border: "1px solid var(--sc-border-input)",
                        background: "var(--sc-bg-secondary)",
                        color: "var(--sc-text)",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Editability matrix
                </button>
            </div>
        </StoryPage>
    );
}

const meta = {
    title: "Accessibility/Matrix",
    component: AccessibilityMatrix,
    tags: ["accessibility", "editable", "readonly"],
} satisfies Meta<typeof AccessibilityMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
