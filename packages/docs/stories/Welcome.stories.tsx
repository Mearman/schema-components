/**
 * README landing page — renders the core package README as a Storybook story.
 */
import hljs from "highlight.js";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import type { Meta, StoryObj } from "@storybook/react";
import readme from "../../../README.md?raw";

marked.use(
    markedHighlight({
        langPrefix: "hljs language-",
        highlight(code: string, lang: string): string {
            if (lang !== "" && hljs.getLanguage(lang) !== undefined) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
    })
);

marked.use({ gfm: true, breaks: false });

const parseResult = marked.parse(readme);
const html = typeof parseResult === "string" ? parseResult : "";

const meta: Meta = {
    title: "README",
};
export default meta;
type Story = StoryObj;

export const Page: Story = {
    name: "README",
    parameters: {
        docs: {
            page: () => (
                <>
                    <link
                        rel="stylesheet"
                        href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css"
                    />
                    <div
                        style={{
                            fontFamily:
                                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            lineHeight: 1.6,
                            maxWidth: "48rem",
                            padding: "2rem",
                            color: "#1a1a1a",
                        }}
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                </>
            ),
        },
    },
    render: () => (
        <>
            <link
                rel="stylesheet"
                href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css"
            />
            <div
                style={{
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    lineHeight: 1.6,
                    maxWidth: "48rem",
                    padding: "2rem",
                    color: "#1a1a1a",
                }}
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </>
    ),
};
