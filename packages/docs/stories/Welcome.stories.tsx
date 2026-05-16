/**
 * README landing page — renders the core package README as a Storybook story.
 *
 * Syntax highlighting is handled entirely by CSS custom properties defined in
 * preview.css (no CDN highlight.js theme stylesheet needed). Highlight.js
 * still tokenises the code via marked-highlight; the .hljs-* token colours
 * are provided by --hljs-* variables that switch automatically in dark mode.
 *
 * Mermaid diagrams (```mermaid …```) are rendered client-side after mount.
 * The README's mermaid code blocks become `<pre class="language-mermaid">`
 * elements after marked processes them. A React effect calls `mermaid.run()`
 * to replace each with an SVG diagram.
 */
import { useCallback, useEffect, useRef, type ReactElement } from "react";
import hljs from "highlight.js";
import mermaid from "mermaid";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import type { Meta, StoryObj } from "@storybook/react";
import readme from "../../../README.md?raw";

marked.use(
    markedHighlight({
        langPrefix: "hljs language-",
        highlight(code: string, lang: string): string {
            // Mermaid diagrams are rendered client-side — do not tokenise.
            if (lang === "mermaid") return code;
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

/**
 * Detects whether the current page is in dark mode by checking the
 * `<html>` element for the `dark-theme` class (set by
 * `@storybook/addon-themes`) or the OS `prefers-color-scheme` media query.
 */
function isDarkMode(): boolean {
    if (typeof document === "undefined") return false;
    const { documentElement } = document;
    if (documentElement.classList.contains("dark-theme")) return true;
    if (documentElement.classList.contains("light-theme")) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * React component that renders the README HTML and initialises mermaid
 * diagrams after mount. Stores the raw diagram source so mermaid can be
 * re-rendered when the Storybook theme changes.
 */
function ReadmeContent(): ReactElement {
    const containerRef = useRef<HTMLDivElement>(null);
    /**
     * Stores the original mermaid source text keyed by a stable id.
     * Populated on first mount so the source survives DOM replacement
     * by mermaid.run().
     */
    const sourcesRef = useRef<Map<string, string>>(new Map());

    /**
     * Re-render all mermaid diagrams with the current theme.
     * Restores raw source from sourcesRef, clears the previous SVG,
     * then calls mermaid.run().
     */
    const renderMermaid = useCallback(() => {
        const container = containerRef.current;
        if (container === null) return;

        const pres = container.querySelectorAll<HTMLPreElement>("pre.mermaid");
        if (pres.length === 0) return;

        // Restore source text and reset each <pre> so mermaid re-renders.
        for (const pre of pres) {
            const id = pre.dataset.mermaidSourceId;
            const source =
                id !== undefined ? sourcesRef.current.get(id) : undefined;
            if (source !== undefined) {
                // Remove the SVG / style mermaid injected, keep raw text.
                pre.replaceChildren();
                pre.textContent = source;
            }
        }

        mermaid.initialize({
            startOnLoad: false,
            theme: isDarkMode() ? "dark" : "default",
        });

        void mermaid.run({ querySelector: "pre.mermaid" });
    }, []);

    // First mount: find mermaid blocks, store source, render.
    useEffect(() => {
        const container = containerRef.current;
        if (container === null) return;

        const mermaidBlocks = container.querySelectorAll(
            "pre code.language-mermaid, pre.language-mermaid > code"
        );
        if (mermaidBlocks.length === 0) return;

        for (const block of mermaidBlocks) {
            const pre = block.parentElement;
            if (pre?.tagName !== "PRE") continue;

            const sourceId = `mermaid-${String(sourcesRef.current.size)}`;
            sourcesRef.current.set(sourceId, block.textContent);

            pre.classList.add("mermaid");
            pre.dataset.mermaidSourceId = sourceId;
            pre.textContent = block.textContent;
            block.remove();
        }

        renderMermaid();
    }, [renderMermaid]);

    // Re-render mermaid when the Storybook theme class changes.
    useEffect(() => {
        const el = document.documentElement;
        const observer = new MutationObserver(() => {
            renderMermaid();
        });
        observer.observe(el, {
            attributeFilter: ["class"],
        });
        return () => {
            observer.disconnect();
        };
    }, [renderMermaid]);

    return (
        <div
            ref={containerRef}
            className="readme-content"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

const meta: Meta = {
    title: "README",
    // `autodocs` controls the Docs tab; `!test` keeps the heavy README parse
    // and mermaid rendering out of the storybook vitest runner.
    tags: ["autodocs", "!test"],
    parameters: {
        docs: {
            page: ReadmeContent,
        },
    },
};
export default meta;
type Story = StoryObj;

export const Page: Story = {
    name: "README",
    tags: ["!dev"],
    render: () => <ReadmeContent />,
};
