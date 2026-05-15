/**
 * README landing page — renders the core package README as a Storybook story.
 *
 * Syntax highlighting is handled entirely by CSS custom properties defined in
 * preview.css (no CDN highlight.js theme stylesheet needed). Highlight.js
 * still tokenises the code via marked-highlight; the .hljs-* token colours
 * are provided by --hljs-* variables that switch automatically in dark mode.
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
    tags: ["autodocs"],
    parameters: {
        docs: {
            page: () => (
                <div
                    className="readme-content"
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            ),
        },
    },
};
export default meta;
type Story = StoryObj;

export const Page: Story = {
    name: "README",
    tags: ["!dev"],
    render: () => (
        <div
            className="readme-content"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    ),
};
