/**
 * `<schema-view>` — read-only Lit Custom Element variant of
 * `<schema-component>`.
 *
 * Parallel to React's `<SchemaView>`: renders the supplied schema +
 * value in read-only mode, never emits a `change` event, and ignores
 * any user input on a nested control. Subclasses
 * `<schema-component>` so the implementation work is just forcing
 * `readOnly = true` and refusing to propagate child change events.
 *
 * **SSR caveat.** This element ALSO runs under `@lit-labs/ssr` for
 * the equivalent of React's server-rendered `<SchemaView>`. The
 * server path uses Declarative Shadow DOM via the `renderToString`
 * helper in `lit/ssr.ts`. See that module's docstring for the
 * documented limitations: `@lit-labs/ssr` is labs status,
 * `@lit/context` does not server-render, and light-DOM-only
 * components are not supported.
 *
 * @packageDocumentation
 */

import { SchemaComponent } from "./SchemaComponent.ts";

/**
 * Lit Custom Element rendering a schema in read-only mode.
 *
 * Tag: `<schema-view>` (registered by `registerSchemaComponents`).
 */
export class SchemaView extends SchemaComponent {
    constructor() {
        super();
        this.readOnly = true;
    }

    override connectedCallback(): void {
        super.connectedCallback();
        // Ensure subsequent property assignments don't flip back to
        // editable — the view variant is read-only by contract.
        this.readOnly = true;
    }
}
