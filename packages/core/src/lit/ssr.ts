/**
 * Server-side rendering entry for the Lit adapter.
 *
 * Wraps `@lit-labs/ssr` to render a single Lit `TemplateResult` (or a
 * pre-constructed `<schema-view>` Custom Element template) to an HTML
 * string with Declarative Shadow DOM markup.
 *
 * # Documented limitations
 *
 * `@lit-labs/ssr` is currently published under the `@lit-labs/*`
 * scope: **labs status**, which the Lit project explicitly flags as
 * "not yet ready for general production use". The schema-components
 * SSR entry inherits these constraints:
 *
 * 1. **Labs status.** The API surface and output format may change in
 *    breaking ways without a major version bump on `lit` proper.
 *    Pin `@lit-labs/ssr` precisely if you depend on this entry in
 *    production.
 * 2. **Async component work is not supported.** Components that
 *    initiate work in `connectedCallback` and resolve in
 *    `updateComplete` will render at their pre-update state. The
 *    built-in `<sc-*>` elements complete their first render
 *    synchronously, so this constraint only bites for consumer-
 *    supplied widgets.
 * 3. **Light-DOM-only components are not supported.** A custom
 *    element that overrides `createRenderRoot()` to return `this`
 *    (rendering into the light DOM rather than a Shadow DOM) will
 *    not server-render. All built-in `<sc-*>` elements use Shadow
 *    DOM and so are compatible.
 * 4. **`@lit/context` does not server-render.** Any value provided
 *    via the context port from `lit/contexts.ts` is `undefined` on
 *    the server. Consumers must default gracefully.
 * 5. **Declarative Shadow DOM support in the consumer's runtime is
 *    required for hydration.** Modern browsers support it; older
 *    targets need the `@webcomponents/template-shadowroot` polyfill.
 *
 * Each limitation is documented at the Lit SSR project page:
 * https://lit.dev/docs/ssr/overview/
 *
 * @packageDocumentation
 */

import { render } from "@lit-labs/ssr";
import { collectResultSync } from "@lit-labs/ssr/lib/render-result.js";
import type { TemplateResult } from "lit";

/**
 * Render a Lit `TemplateResult` to an HTML string, emitting Declarative
 * Shadow DOM markup for every Custom Element it contains.
 *
 * The synchronous variant (`collectResultSync`) is documented to
 * throw when the underlying render emits async iterables — which
 * happens whenever a component uses `until`, `asyncReplace`, or
 * similar async directives. The built-in `<sc-*>` elements never do
 * this, so the synchronous path is safe for the default use.
 * Consumer widgets that introduce async behaviour must use the
 * streaming SSR API directly (out of scope for this entry).
 *
 * @example
 * ```ts
 * import { html } from "lit";
 * import "schema-components/lit/registry";  // registers <sc-*>
 * import { renderShadowedHtml } from "schema-components/lit/ssr";
 *
 * const tpl = html`<schema-view .schema=${userSchema} .value=${user}></schema-view>`;
 * const markup = renderShadowedHtml(tpl);
 * ```
 *
 * @param template - The Lit template to render.
 * @returns The rendered HTML string with Declarative Shadow DOM
 *   markup.
 */
export function renderShadowedHtml(template: TemplateResult): string {
    const result = render(template);
    return collectResultSync(result);
}

/**
 * Alias for the more discoverable name, mirroring the React
 * `renderToString` pattern. Identical to {@link renderShadowedHtml}.
 */
export function renderToString(template: TemplateResult): string {
    return renderShadowedHtml(template);
}
