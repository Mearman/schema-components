import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { profileData, profileSchema } from "../src/demo-schemas.ts";
import {
    DemoCard,
    DemoGrid,
    JsonPanel,
    StoryPage,
} from "../src/story-layout.tsx";
import { ThemeSchemaDemo } from "../src/theme-renderers.tsx";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

function LiveJsonState() {
    const [value, setValue] = useState<unknown>(profileData);

    return (
        <StoryPage
            title="Interactive state"
            description="Editable components are presentational. They emit the next value through onChange; the caller owns state and can render it anywhere."
        >
            <DemoGrid>
                <DemoCard title="Editable headless component">
                    <SchemaComponent
                        schema={profileSchema}
                        value={value}
                        onChange={(next) => {
                            setValue(next);
                        }}
                    />
                </DemoCard>
                <DemoCard title="Live JSON output">
                    <JsonPanel value={value} />
                </DemoCard>
            </DemoGrid>
        </StoryPage>
    );
}

function ThemedLiveState() {
    return (
        <StoryPage
            title="Interactive state with a theme"
            description="Theme adapters keep the same state contract. Only presentation changes."
        >
            <ThemeSchemaDemo
                schema={profileSchema}
                value={profileData}
                theme="radix"
            />
        </StoryPage>
    );
}

const meta: Meta = {
    title: "Getting Started/Interactive State",
};

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveJson: Story = {
    render: () => <LiveJsonState />,
};

export const ThemedState: Story = {
    render: () => <ThemedLiveState />,
};
