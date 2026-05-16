/**
 * Mermaid diagram renderer for MDX docs pages.
 *
 * MDX cannot rely on the same `marked` pipeline used by `Welcome.stories.tsx`
 * because MDX renders to JSX directly — there is no intermediate fenced
 * code-block HTML to post-process. Instead, this component renders the
 * diagram source into a `<pre class="mermaid">` element and calls
 * `mermaid.run()` after mount to replace it with an inline SVG.
 *
 * Re-renders whenever the Storybook theme class on `<html>` changes, so
 * dark mode produces a dark-themed diagram without a page reload.
 */
import { useCallback, useEffect, useRef, type ReactElement } from "react";
import mermaid from "mermaid";

/**
 * Detects whether the current page is in dark mode by checking the
 * `<html>` element for the `dark-theme` class set by
 * `@storybook/addon-themes`, with a fallback to the OS preference.
 */
function isDarkMode(): boolean {
    if (typeof document === "undefined") return false;
    const { documentElement } = document;
    if (documentElement.classList.contains("dark-theme")) return true;
    if (documentElement.classList.contains("light-theme")) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export interface MdxMermaidProps {
    /** Raw mermaid diagram source — the same text you would put in a ```mermaid``` fence. */
    chart: string;
}

/**
 * Renders a mermaid diagram inside an MDX page. The diagram source is
 * preserved across re-renders so theme changes can re-run mermaid against
 * the original text.
 */
export function MdxMermaid({ chart }: MdxMermaidProps): ReactElement {
    const preRef = useRef<HTMLPreElement>(null);

    const renderMermaid = useCallback(() => {
        const pre = preRef.current;
        if (pre === null) return;

        // Reset to raw source so mermaid can re-render under the new theme.
        pre.replaceChildren();
        pre.textContent = chart;
        pre.removeAttribute("data-processed");

        mermaid.initialize({
            startOnLoad: false,
            theme: isDarkMode() ? "dark" : "default",
        });

        void mermaid.run({ nodes: [pre] });
    }, [chart]);

    // First mount + when the chart text changes.
    useEffect(() => {
        renderMermaid();
    }, [renderMermaid]);

    // Re-render when the Storybook theme class on <html> changes.
    useEffect(() => {
        const el = document.documentElement;
        const observer = new MutationObserver(() => {
            renderMermaid();
        });
        observer.observe(el, { attributeFilter: ["class"] });
        return () => {
            observer.disconnect();
        };
    }, [renderMermaid]);

    return <pre ref={preRef} className="mermaid readme-content" />;
}
