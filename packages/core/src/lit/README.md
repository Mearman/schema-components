# schema-components / Lit Web Components adapter

> Render any Zod schema, JSON Schema, or OpenAPI document as a tree of standards-based Custom Elements built with Lit.

This adapter is the Phase 2 sibling of the React and HTML pipelines. The walker, normaliser, OpenAPI surface, ARIA id derivation, union matching, and constraint extraction live in `core/` and are shared by every adapter. The Lit adapter adds a parallel render surface on top of Custom Elements.

## Quick start

```ts
import "schema-components/lit/registry";   // side-effect-free; you MUST call register
import { registerSchemaComponents } from "schema-components/lit/registry";
import { z } from "zod";

registerSchemaComponents();   // defines <schema-component>, <schema-view>, <schema-field>, <sc-*>

const userSchema = z.object({
    name: z.string(),
    email: z.email(),
});

const el = document.querySelector("schema-component");
if (el !== null) {
    // Property-only — schemas cannot serialise through HTML attributes.
    Reflect.set(el, "schema", userSchema);
    Reflect.set(el, "value", { name: "Ada", email: "ada@example.com" });
    el.addEventListener("change", (e) => {
        if (e instanceof CustomEvent) {
            console.log("user changed to", e.detail.value);
        }
    });
}
```

## Tags registered

`registerSchemaComponents(prefix?: string)` defines every built-in element on the global `customElements` registry. Pass a non-empty prefix to namespace the tags out of collision with any other library that ships `<sc-*>` elements.

### Orchestrator tags

| Tag | Element | Description |
| --- | --- | --- |
| `<schema-component>` | `SchemaComponent` | Top-level editable schema renderer. Emits a public `change` Custom Event on every user edit. |
| `<schema-view>` | `SchemaView` | Read-only subclass — emits no `change` event. |
| `<schema-field>` | `SchemaField` | Renders a single sub-field of a schema by dot-separated `path`. |

### Per-type tags

| Tag | Schema type | React equivalent |
| --- | --- | --- |
| `<sc-string>` | `StringField` | `renderString` |
| `<sc-number>` | `NumberField` | `renderNumber` |
| `<sc-boolean>` | `BooleanField` | `renderBoolean` |
| `<sc-enum>` | `EnumField` | `renderEnum` |
| `<sc-object>` | `ObjectField` | `renderObject` |
| `<sc-array>` | `ArrayField` | `renderArray` |
| `<sc-tuple>` | `TupleField` | `renderTuple` |
| `<sc-record>` | `RecordField` | `renderRecord` |
| `<sc-union>` | `UnionField` | `renderUnion` |
| `<sc-discriminated>` | `DiscriminatedUnionField` | `DiscriminatedUnionTabs` |
| `<sc-conditional>` | `ConditionalField` | `renderConditional` |
| `<sc-negation>` | `NegationField` | `renderNegation` |
| `<sc-literal>` | `LiteralField` | `renderLiteral` |
| `<sc-null>` | `NullField` | `renderNull` |
| `<sc-never>` | `NeverField` | `renderNever` |
| `<sc-file>` | `FileField` | `renderFile` |
| `<sc-unknown>` | `UnknownField` | `renderUnknown` |

### Prefix override

```ts
const result = registerSchemaComponents("myapp-");
// result.tags["sc-string"] === "myapp-sc-string"
// result.tags["schema-component"] === "myapp-schema-component"
```

The default resolver returned by `createDefaultLitResolver(result)` looks up the prefixed tag, so the orchestrator instantiates `<myapp-sc-string>` rather than `<sc-string>` automatically.

## Property-only `schema` / `value` / `resolver`

Custom Element attributes are strings. Schemas, walked field trees, resolver function maps, and arbitrary JS values cannot round-trip safely through attribute serialisation. Three of the orchestrator's properties (`schema`, `value`, `resolver`, plus the optional `widgets` and `meta`) are therefore declared with `attribute: false`. The `readOnly` field IS reflected to the `readonly` HTML attribute so the common read-only case is reachable from plain HTML markup.

### Framework wrappers

Each framework's official Custom Element interop handles property binding differently:

- **React 19+** supports plain JS property binding via the `ref` callback. Lit also publishes a [React wrapper generator](https://lit.dev/docs/frameworks/react/) for typed JSX.
- **Vue 3** has `defineCustomElement` interop; props bound with `.` notation (e.g. `<schema-component .schema="userSchema" />`) pass through as JS properties.
- **Svelte** native CE support handles JS property binding directly via `bind:`.
- **Vanilla JS** uses `Reflect.set` or `element.schema = ...` directly.

## Themes — CSS Parts and Custom Properties

Each built-in element exposes CSS Parts on its key internal nodes. Style by adding rules to the host page targeting the Custom Element with the `::part()` selector:

```css
sc-string::part(input) {
    border: 1px solid var(--sc-color-fg, #d1d5db);
    padding: 0.25rem 0.5rem;
    border-radius: var(--sc-radius-md, 0.25rem);
}
sc-string::part(value) {
    color: var(--sc-color-fg, #111);
}
sc-string::part(hint) {
    color: var(--sc-color-fg-subtle, #6b7280);
    font-size: 0.875em;
}
sc-discriminated::part(tab-active) {
    border-bottom: 2px solid var(--sc-color-accent, #3b82f6);
}
```

### Parts taxonomy

| Element | Parts |
| --- | --- |
| `<sc-string>`, `<sc-unknown>`, `<sc-file>` | `input`, `value`, `hint` |
| `<sc-number>` | `input`, `value`, `hint` |
| `<sc-boolean>` | `input`, `value` |
| `<sc-enum>` | `input`, `value`, `hint` |
| `<sc-literal>`, `<sc-null>`, `<sc-never>` | `value` |
| `<sc-object>` | `fieldset`, `legend`, `field`, `label` |
| `<sc-array>` | `list`, `item`, `remove`, `add` |
| `<sc-tuple>` | `tuple`, `item`, `rest-item` |
| `<sc-record>` | `list`, `item`, `key`, `remove`, `add` |
| `<sc-union>` | `value` |
| `<sc-discriminated>` | `container`, `tablist`, `tab`, `tab-active`, `panel` |
| `<sc-conditional>`, `<sc-negation>` | `fieldset`, `clause` |

### Recommended CSS Custom Properties

The default elements consume the following Custom Properties for themeability. None are required — the elements render with no styling at all by default; consumers opt in by defining the variables on `:root` or a wrapping element.

```css
:root {
    /* Colour palette */
    --sc-color-fg: #111;
    --sc-color-fg-subtle: #6b7280;
    --sc-color-bg: transparent;
    --sc-color-accent: #3b82f6;
    --sc-color-required: #dc2626;

    /* Spacing */
    --sc-spacing-xs: 0.125rem;
    --sc-spacing-sm: 0.25rem;
    --sc-spacing-md: 0.5rem;
    --sc-spacing-lg: 1rem;

    /* Border-radius */
    --sc-radius-md: 0.25rem;
}
```

## Server-side rendering

`@lit-labs/ssr` renders the elements to HTML with Declarative Shadow DOM markup:

```ts
import { html } from "lit";
import "schema-components/lit/registry";
import { renderToString } from "schema-components/lit/ssr";
import { registerSchemaComponents } from "schema-components/lit/registry";

registerSchemaComponents();

const tpl = html`<schema-view .schema=${userSchema} .value=${user}></schema-view>`;
const markup = renderToString(tpl);
```

### Documented limitations

`@lit-labs/ssr` is currently published under the `@lit-labs/*` scope — **labs status**, which the Lit team explicitly flags as "not yet ready for general production use". The schema-components SSR entry inherits these constraints:

1. **Labs status.** API surface and output format may change in breaking ways without a major version bump on `lit` proper.
2. **Async component work is not supported.** Components that initiate work in `connectedCallback` and resolve in `updateComplete` will render at their pre-update state. The built-in `<sc-*>` elements complete their first render synchronously.
3. **Light-DOM-only components are not supported.** A custom element that overrides `createRenderRoot()` to return `this` will not server-render. All built-in `<sc-*>` elements use Shadow DOM and so are compatible.
4. **`@lit/context` does not server-render.** Any value provided via the resolver / widgets context port from `lit/contexts.ts` is `undefined` on the server. Consumers must default gracefully — the built-in renderers fall back to the default resolver.
5. **Declarative Shadow DOM support in the consumer's runtime is required for hydration.** Modern browsers support it; older targets need the `@webcomponents/template-shadowroot` polyfill.

See <https://lit.dev/docs/ssr/overview/> for the upstream documentation.

## Resolver, widgets, and overrides

### `LitComponentResolver`

Same shape as the React `ComponentResolver` — one optional render function per schema type. Render functions return Lit `TemplateResult` (the value produced by an `html`-tagged template literal). Used to bypass the default Custom Element registry for a specific type:

```ts
import { html } from "lit";
import type { LitComponentResolver } from "schema-components/lit/types";

const myResolver: LitComponentResolver = {
    string: (props) => html`<my-fancy-input
        .value=${props.value}
        @input=${(e: Event) => {
            const t = e.target;
            if (t instanceof HTMLInputElement) props.change(t.value);
        }}
    ></my-fancy-input>`,
};
```

Assign the resolver to the orchestrator:

```ts
Reflect.set(el, "resolver", myResolver);
```

### Widgets — Custom Element registry of named elements

Where the React adapter resolves widgets via function values, the Lit adapter resolves by Custom Element tag name:

```ts
import { registerLitWidget } from "schema-components/lit/widget";
import "./my-color-picker.ts";   // calls customElements.define("my-color-picker", ColorPicker)

registerLitWidget("color-picker", "my-color-picker");
```

A schema field with `.meta({ component: "color-picker" })` then renders as `<my-color-picker>` with the per-field props attached. Tags MUST be registered with `customElements.define` before the schema field is rendered.

For instance-scoped widgets, set the `widgets` property on `<schema-component>`:

```ts
const w = new Map<string, string>();
w.set("color-picker", "my-color-picker");
Reflect.set(el, "widgets", w);
```

## Architecture diagram

```
   <schema-component>
   ├─ normaliseSchema → walk → WalkedField tree
   ├─ resolver dispatch on tree.type
   │   ├─ for each leaf:    document.createElement("sc-<type>")
   │   ├─ for each branch:  document.createElement("sc-<container>")
   │   └─ widget hint:      document.createElement(registeredTag)
   └─ public `change` Custom Event on root edits

   <sc-*> Custom Elements
   ├─ BaseScElement: shared property declarations + emitChange()
   ├─ render() emits a Lit TemplateResult
   ├─ user input → @input/@change → emitChange()
   └─ sc-change CustomEvent (bubbles, composed) → orchestrator
```

## Open design questions

The Lit adapter is the largest and most exploratory Phase 2 deliverable; several design points remain open. Resolved decisions:

- **Tag prefix collisions** — solved by `registerSchemaComponents(prefix?)`. Idempotent against `customElements.get`.
- **Property vs. attribute boundary** — schemas, values, resolvers all property-only. `readOnly` reflects to the `readonly` attribute for HTML usage.
- **Themes** — CSS Parts on every key internal node, documented Custom Properties.
- **Light DOM mode** — not supported (SSR doesn't support it). Every element uses Shadow DOM.
- **SSR** — wired through `@lit-labs/ssr` with the labs-status caveats documented above.
- **No barrel file** — the project's lint rule bans `index.ts`; every export is imported directly from its source module.
- **No class-field initialisers** — `static properties` accessors would be shadowed; every reactive field uses `declare` plus a constructor assignment.

Parked for follow-up:

- **Bundled theme adapters.** No `themes/shadcn-lit.ts` / `themes/mui-lit.ts` shipped — the existing React theme adapters operate over class-string composition under a non-Shadow-DOM CSS reachability assumption that doesn't port. A future spike should explore whether `::part` based wrappers over a third-party Web Components library (Shoelace / Web Awesome) make sense as a first bundled Lit theme.
- **`<SchemaErrorBoundary>` equivalent.** Lit emits errors through a `lit-warning` Custom Event but does not have a dedicated boundary class. The schema-components adapter currently lets `SchemaRenderError` bubble up as a normal exception; a Promise-rejection-handler-based boundary could be added if a consumer reports a use case.
- **Validation plumbing.** React's `<SchemaComponent>` carries `validate`, `onValidationError`, and `onError` props. The Lit adapter omits them for v1 — validation can be driven from outside the element by the consumer running `schema.safeParse(e.detail.value)` in the `change` event listener. A future iteration may surface a built-in `validation` Custom Event.
- **`@lit/context` server rendering.** Awaiting upstream support; the schema-components adapter already falls back to the default resolver when no provider is reachable.
- **Vue 3 / Solid / Svelte direct adapters.** Decoupled from this Lit work per the multi-framework research note. The Lit adapter is consumable via Custom Element interop today, but the future direct adapters will share the `core/contexts.ts` `ContextPort<T>` shape introduced here (currently lives under `lit/contexts.ts` because `core/contexts.ts` itself does not yet exist).
- **`core/contexts.ts` migration.** The framework-agnostic `ContextPort<T>` interface lives in `lit/contexts.ts` for now. When a second adapter starts (Vue / Solid / Svelte), the interface should be lifted to `core/contexts.ts` and the Lit binding becomes a per-framework specialisation.
