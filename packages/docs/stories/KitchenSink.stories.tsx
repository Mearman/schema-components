import type { Meta, StoryObj } from "@storybook/react";
import {
    discriminatedUnionData,
    discriminatedUnionSchema,
    kitchenSinkData,
    kitchenSinkSchema,
} from "../src/demo-schemas.ts";
import {
    DemoCard,
    DemoGrid,
    StoryPage,
    StorySection,
} from "../src/story-layout.tsx";
import { ThemeSchemaDemo } from "../src/theme-renderers.tsx";

function KitchenSink() {
    return (
        <StoryPage
            title="Kitchen sink"
            description="A single schema exercising strings, numbers, booleans, enums, dates, defaults, readOnly/writeOnly, nested objects, arrays, records, visibility, ordering, and discriminated unions."
        >
            <StorySection
                title="Headless canonical schema"
                description="This is the broadest behavioural fixture. Use it when changing the walker, editability, defaults, visibility, ordering, or renderer dispatch."
            >
                <DemoGrid>
                    <DemoCard title="Editable">
                        <ThemeSchemaDemo
                            schema={kitchenSinkSchema}
                            value={kitchenSinkData}
                            theme="headless"
                        />
                    </DemoCard>
                    <DemoCard title="Read-only">
                        <ThemeSchemaDemo
                            schema={kitchenSinkSchema}
                            value={kitchenSinkData}
                            theme="headless"
                            readOnly
                        />
                    </DemoCard>
                </DemoGrid>
            </StorySection>
            <StorySection
                title="Discriminated union"
                description="The discriminated union resolver uses tabs in the headless renderer and falls back to the shared union behaviour in component-library adapters."
            >
                <DemoCard>
                    <ThemeSchemaDemo
                        schema={discriminatedUnionSchema}
                        value={discriminatedUnionData}
                        theme="headless"
                    />
                </DemoCard>
            </StorySection>
        </StoryPage>
    );
}

const meta: Meta<typeof KitchenSink> = {
    title: "Getting Started/Kitchen Sink",
    component: KitchenSink,
};

export default meta;
type Story = StoryObj<typeof KitchenSink>;

export const Default: Story = {
    render: () => <KitchenSink />,
};
