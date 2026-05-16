import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { linkTo } from "@storybook/addon-links";
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
            <div style={{ marginTop: "1rem" }}>
                <button
                    type="button"
                    onClick={linkTo("Theme Adapters/Comparison", "Editable")}
                    style={{
                        border: "1px solid #94a3b8",
                        background: "#fff",
                        color: "#0f172a",
                        borderRadius: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                    }}
                >
                    Compare the same schema across theme adapters
                </button>
            </div>
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
    tags: ["editable", "interactive"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveJson: Story = {
    render: () => <LiveJsonState />,
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step(
            "typing into the editable name field updates the live JSON output",
            async () => {
                const nameInput =
                    await canvas.findByPlaceholderText(/full name/i);
                await userEvent.clear(nameInput);
                await userEvent.type(nameInput, "Grace Hopper");
                await waitFor(async () => {
                    await expect(canvasElement.textContent).toContain(
                        "Grace Hopper"
                    );
                });
            }
        );
    },
};

export const ThemedState: Story = {
    tags: ["theme-adapter", "interactive"],
    render: () => <ThemedLiveState />,
};
