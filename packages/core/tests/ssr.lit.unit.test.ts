/**
 * SSR tests for the Lit adapter.
 *
 * Uses `@lit-labs/ssr` to render Lit templates to HTML strings with
 * Declarative Shadow DOM markup. The tests skip cases that are
 * documented-as-unsupported by `@lit-labs/ssr`:
 *
 * - async component work
 * - light-DOM-only components
 * - `@lit/context` consumer wiring (no provider visible on server)
 *
 * @see lit/ssr.ts for the documented limitations.
 */

import { describe, it, expect } from "vitest";
import { html } from "lit";
import { renderToString, renderShadowedHtml } from "../src/lit/ssr.ts";

describe("renderToString / renderShadowedHtml", () => {
    it("renders a static Lit template to an HTML string", () => {
        const tpl = html`<p>Hello</p>`;
        const out = renderToString(tpl);
        expect(out).toContain("<p>Hello</p>");
    });

    it("aliases via renderShadowedHtml", () => {
        const tpl = html`<span>aliased</span>`;
        const out = renderShadowedHtml(tpl);
        expect(out).toContain("<span>aliased</span>");
    });

    it("renders nested elements into the output stream", () => {
        const tpl = html`<div><a>one</a><b>two</b></div>`;
        const out = renderToString(tpl);
        expect(out).toContain("<a>one</a>");
        expect(out).toContain("<b>two</b>");
    });
});
