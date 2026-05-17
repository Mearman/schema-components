import type { Meta, StoryObj } from "@storybook/react";
import { linkTo } from "@storybook/addon-links";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { renderToHtml } from "schema-components/html/renderToHtml";
import { renderToHtmlChunks } from "schema-components/html/renderToHtmlStream";
import { kitchenSinkData, kitchenSinkSchema } from "../src/demo-schemas.ts";
import {
    DemoCard,
    DemoGrid,
    StoryPage,
    StorySection,
} from "../src/story-layout.tsx";

const staticHtml = renderToHtml(kitchenSinkSchema, { value: kitchenSinkData });
const chunks = [
    ...renderToHtmlChunks(kitchenSinkSchema, { value: kitchenSinkData }),
];
const streamedHtml = chunks.join("");

function HtmlParity() {
    return (
        <StoryPage
            title="HTML parity"
            description="The React renderer, static HTML renderer, and streaming HTML renderer consume the same schema tree. Streaming output should match static HTML exactly."
        >
            <StorySection
                title="React and HTML outputs"
                description="The HTML renderer emits semantic markup with sc-* classes. The React renderer remains headless by default."
            >
                <DemoGrid>
                    <DemoCard title="React">
                        <SchemaComponent
                            schema={kitchenSinkSchema}
                            value={kitchenSinkData}
                        />
                    </DemoCard>
                    <DemoCard title="Static HTML">
                        <div dangerouslySetInnerHTML={{ __html: staticHtml }} />
                    </DemoCard>
                </DemoGrid>
            </StorySection>
            <StorySection title="Streaming equivalence">
                <DemoCard
                    title={`${String(chunks.length)} chunks, ${String(streamedHtml.length)} bytes, ${staticHtml === streamedHtml ? "matching" : "different"}`}
                >
                    <div dangerouslySetInnerHTML={{ __html: streamedHtml }} />
                </DemoCard>
            </StorySection>
            <div
                style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginTop: "1rem",
                    flexWrap: "wrap",
                }}
            >
                <button
                    type="button"
                    onClick={linkTo("Theme Adapters/Headless", "Editable")}
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
                    React headless renderer
                </button>
                <button
                    type="button"
                    onClick={linkTo(
                        "HTML Rendering/Streaming",
                        "ChunkedEditable"
                    )}
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
                    HTML streaming
                </button>
            </div>
        </StoryPage>
    );
}

const meta: Meta<typeof HtmlParity> = {
    title: "HTML Rendering/Parity",
    component: HtmlParity,
    tags: ["html"],
};

export default meta;
type Story = StoryObj<typeof HtmlParity>;

export const Default: Story = {
    render: () => <HtmlParity />,
};
