# schema-components

React components that render UI from Zod schemas, JSON Schema, and OpenAPI documents.

Define your data model once. Get presentational views, input fields, and editable forms — no manual wiring.

## Install

```bash
npm install schema-components
```

Peer dependencies: `zod@^4.0.0`, `react@^18.0.0 || ^19.0.0`.

## Quick start

```tsx
import { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const userSchema = z.object({
  name: z.string().min(1).meta({ description: "Full name" }),
  email: z.email().meta({ description: "Email address" }),
  role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
  active: z.boolean().meta({ description: "Active" }),
});

function UserCard() {
  const [user, setUser] = useState({
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin",
    active: true,
  });

  return (
    <SchemaComponent
      schema={userSchema}
      value={user}
      onChange={setUser}
    />
  );
}
```

Renders every field as an editable input. Add `readOnly` to the component for a read-only view:

```tsx
<SchemaComponent schema={userSchema} value={user} readOnly />
```

## How it works

```
Zod schema ─── z.toJSONSchema() ──→ JSON Schema ──────────┐
                                                           ▼
JSON Schema ─────────────────────────────────────────► JSON Schema ──► walker ──► React
                                                           ▲
OpenAPI doc ── extract schemas ───────────────────────────┘
```

One walker, one input format. The walker reads standard JSON Schema keywords (Draft 2020-12) — decoupled from Zod's internal API. `z.toJSONSchema()` is lossless: it preserves `readOnly`, `writeOnly`, custom `.meta()` properties, constraints, formats, and defaults.

`z.fromJSONSchema()` is used **only for validation** — converting JSON Schema / OpenAPI inputs back to Zod when `validate` is true and the original wasn't a Zod schema.

## Component editability

Fields render in one of three states, controlled by `readOnly` and `writeOnly` from three sources:

| State | Rendering |
|---|---|
| **Presentation** | Read-only display. Formatted text, links, badges. No inputs. |
| **Input** | Empty field. Blank inputs, "Select…" dropdowns, unchecked toggles. |
| **Editable** | Pre-populated input the user can change. |

### Three sources, priority order

1. **Schema property** (`.meta({ readOnly: true })`) — always wins
2. **Component props** (`readOnly` / `writeOnly` on `<SchemaComponent>`) — rendering context
3. **Schema root** (`.meta({ readOnly: true })` on root schema) — fallback default
4. Neither → Editable

### Overriding with `readOnly: false`

A field override can explicitly opt out of a higher-level `readOnly`:

```tsx
<SchemaComponent
  schema={userSchema}
  value={user}
  readOnly                         // everything presentation
  fields={{
    address: {
      readOnly: false,            // address subtree: editable
      city: { readOnly: true },   // city: still presentation
    },
  }}
/>
```

## Type-safe field overrides

The `fields` prop type is inferred from the schema:

```tsx
// Zod — full autocomplete
<SchemaComponent
  schema={userSchema}
  fields={{
    name: { readOnly: true },            // ✓ type-safe
    address: {
      city: { description: "City" },     // ✓ nested, type-safe
    },
    // nme: { readOnly: true },          // ✗ TypeScript error: unknown key
  }}
/>

// JSON Schema as const — full autocomplete
const jsonSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const },
    email: { type: "string" as const, format: "email" },
  },
  required: ["name"],
} as const;

<SchemaComponent
  schema={jsonSchema}
  fields={{
    name: { readOnly: true },            // ✓ inferred from as const
    // nme: { readOnly: true },          // ✗ TypeScript error
  }}
/>

// OpenAPI as const + ref — full autocomplete
const spec = {
  openapi: "3.1.0",
  components: {
    schemas: {
      User: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          name: { type: "string" as const },
        },
        required: ["id", "name"],
      },
    },
  },
} as const;

<SchemaComponent
  schema={spec}
  ref="#/components/schemas/User"
  fields={{
    id: { readOnly: true },              // ✓ inferred through ref
  }}
/>
```

## Individual fields

```tsx
import { SchemaField } from "schema-components/react/SchemaComponent";

// Type-safe path — only valid dot-paths accepted
<SchemaField
  schema={userSchema}
  path="address.city"      // ✓ type-safe
  // path="address.cty"   // ✗ TypeScript error
  value={user}
  onChange={setUser}
/>
```

When the schema is a Zod schema or typed `as const`, only valid dot-paths like `"address.city"` are accepted. Invalid paths trigger TypeScript errors. Runtime schemas accept any string.

## All input formats

`<SchemaComponent>` auto-detects the input format:

```tsx
// Zod schema
<SchemaComponent schema={z.object({ name: z.string() })} value={data} />

// JSON Schema
<SchemaComponent
  schema={{ type: "object", properties: { name: { type: "string" } } }}
  value={data}
/>

// OpenAPI document + ref
<SchemaComponent
  schema={openApiSpec}
  ref="#/components/schemas/User"
  value={data}
/>
```

## OpenAPI components

Render API operations with type-safe field overrides:

```tsx
import { ApiOperation } from "schema-components/openapi/components";
import type { ApiRequestBodyProps } from "schema-components/openapi/components";

const petStore = {
  openapi: "3.1.0",
  paths: {
    "/pets": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  tag: { type: "string" as const },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
  },
} as const;

// Full operation — parameters, request body, responses
<ApiOperation schema={petStore} path="/pets" method="post" />

// Just the request body with type-safe fields
<ApiRequestBody
  schema={petStore}
  path="/pets"
  method="post"
  fields={{
    name: { description: "Pet name" },    // ✓ inferred from as const
    // nme: { description: "X" },         // ✗ TypeScript error
  }}
/>

// Just parameters with type-safe overrides
<ApiParameters
  schema={petStore}
  path="/pets"
  method="get"
  overrides={{
    limit: { description: "Max results" }, // ✓ inferred parameter names
  }}
/>

// Response schema
<ApiResponse schema={petStore} path="/pets" method="get" status="200" />
```

## Theme adapters

Headless by default (plain HTML). Wrap with a theme adapter for styled components:

```tsx
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { shadcnResolver } from "schema-components/themes/shadcn";

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

Write a custom adapter:

```tsx
import type { RenderProps, ComponentResolver } from "schema-components/core/renderer";

const myResolver: ComponentResolver = {
  string: (props: RenderProps) => {
    if (props.readOnly) return <span>{props.value}</span>;
    return <input value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
  },
  object: (props: RenderProps) => {
    // props.renderChild recursively renders each field
    return (
      <div>
        {props.fields && Object.entries(props.fields).map(([key, field]) => (
          <div key={key}>
            <label>{field.meta.description}</label>
            {props.renderChild(field, (props.value as Record<string, unknown>)?.[key], (v) => {
              props.onChange({ ...(props.value as object), [key]: v });
            })}
          </div>
        ))}
      </div>
    );
  },
};
```

Every render function receives `props.renderChild` for recursive rendering — no need to know about the resolver or rendering context.

## Raw HTML

Render schemas to HTML strings — no React needed. Useful for server-side rendering, email templates, static sites, and non-React environments.

```tsx
import { renderToHtml } from "schema-components/html/renderToHtml";

const userSchema = z.object({
  name: z.string().meta({ description: "Name" }),
  email: z.email().meta({ description: "Email" }),
  role: z.enum(["admin", "editor", "viewer"]).meta({ description: "Role" }),
});

// Read-only display
const html = renderToHtml(userSchema, {
  value: { name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
  readOnly: true,
});
// → <dl class="sc-object">
//     <dt class="sc-label">Name</dt><dd class="sc-value"><span class="sc-value">Ada Lovelace</span></dd>
//     <dt class="sc-label">Email</dt><dd class="sc-value"><a class="sc-value" href="mailto:ada@example.com">ada@example.com</a></dd>
//     <dt class="sc-label">Role</dt><dd class="sc-value"><span class="sc-value">admin</span></dd>
//   </dl>

// Editable form
const formHtml = renderToHtml(userSchema, {
  value: { name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
});
// → <fieldset class="sc-object">
//     <div class="sc-field">
//       <label class="sc-label" for="sc-name">Name</label>
//       <input class="sc-input" type="text" name="" value="Ada Lovelace">
//     </div>
//     ...
//   </fieldset>
```

All HTML output uses `sc-` prefixed classes for styling hooks. HTML is properly escaped by the serialiser — no manual escaping needed.

A default stylesheet is included:

```html
<link rel="stylesheet" href="node_modules/schema-components/dist/html/styles.css">
```

Or import in JS:

```ts
import "schema-components/styles.css";
```

### Structured HTML construction

The HTML renderer uses a typed `h()` builder instead of string templates. This gives compile-time safety and automatic escaping:

```ts
import { h, serialize, raw } from "schema-components/html/html";

// Build elements — attrs are type-checked, values auto-escaped
const input = h("input", { type: "text", id: "name", value: userValue });
serialize(input); // → <input type="text" id="name" value="Ada">

// Embed pre-serialised HTML (from child renderers)
const div = h("div", { class: "field" }, raw(childHtml));
serialize(div);
```

The builder handles void elements (`<input>`, `<br>`, etc.), boolean attributes (`checked`, `disabled`), fragments, and nested children.

### Streaming HTML

Three output formats for incremental rendering:

```ts
import { renderToHtmlChunks } from "schema-components/html/renderToHtmlStream";
import { renderToHtmlStream } from "schema-components/html/renderToHtmlStream";
import { renderToHtmlReadable } from "schema-components/html/renderToHtmlStream";

// Sync iterable — chunks yielded at field/item/entry boundaries
const chunks: string[] = [...renderToHtmlChunks(schema, { value })];

// Async iterable — yields control to event loop between chunks
for await (const chunk of renderToHtmlStream(schema, { value })) {
  res.write(chunk);
}

// Web ReadableStream — for Response, TransformStream, etc.
return new Response(renderToHtmlReadable(schema, { value }), {
  headers: { "Content-Type": "text/html" },
});
```

Concatenating all chunks produces identical output to `renderToHtml`.

### Accessibility

The HTML renderer produces WAI-ARIA-compliant markup:

| Attribute | When |
|---|---|
| `id="<key>"` | All editable inputs |
| `aria-required="true"` | Required fields (`isOptional === false`) |
| `aria-describedby="<id>-hint"` | Fields with constraints (min/max/length/pattern) |
| `aria-readonly="true"` | Read-only presentation spans |
| `aria-label="<description>"` | Checkboxes (no visible text node) |
| `role="group"` | Record containers |
| `aria-label` on `<fieldset>` | Object with description |
| `<small class="sc-hint">` | Constraint hint text |
| `<span class="sc-required" aria-hidden="true">*` | Required field indicator |

### Custom HTML resolver

```ts
import { renderToHtml } from "schema-components/html/renderToHtml";
import type { HtmlResolver, HtmlRenderProps } from "schema-components/html/renderToHtml";

const tailwindResolver: HtmlResolver = {
  string: (props: HtmlRenderProps) => {
    if (props.readOnly) {
      return `<span class="text-sm text-gray-700">${typeof props.value === "string" ? props.value : ""}</span>`;
    }
    return `<input class="border rounded px-2 py-1" type="text" value="${typeof props.value === "string" ? props.value : "">">`;
  },
};

const html = renderToHtml(schema, { value, readOnly: true, resolver: tailwindResolver });
```

Custom resolvers fall back to the default for any type you don't override.

## Custom widgets

Register widgets by `.meta({ component })` hint:

```tsx
import { registerWidget } from "schema-components/react/SchemaComponent";

registerWidget("richtext", ({ value, onChange }) => (
  <RichTextEditor value={value} onChange={onChange} />
));

// In schema
const schema = z.object({
  bio: z.string().meta({ component: "richtext" }),
});
```

Resolution order: `.meta({ component })` → registered widget → theme adapter → headless default.

## Validation

```tsx
<SchemaComponent
  schema={userSchema}
  value={user}
  onChange={setUser}
  validate
  onValidationError={(error) => console.error(error)}
/>
```

Validation uses the original Zod schema (if input was Zod) or `z.fromJSONSchema()` (if input was JSON Schema / OpenAPI).

## Discriminated unions

Discriminated unions (`z.discriminatedUnion` or JSON Schema `oneOf` with `const` properties) render as tabbed panels. Each tab is labelled by the discriminator's `const` value. Clicking a tab resets the value with the new discriminator.

```tsx
const payment = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("card"),
    cardNumber: z.string(),
    expiry: z.string(),
  }),
  z.object({
    method: z.literal("bank"),
    accountNumber: z.string(),
    sortCode: z.string(),
  }),
]);

<SchemaComponent schema={payment} value={{ method: "card", cardNumber: "4111...", expiry: "12/28" }} />
```

In read-only mode, only the active variant is rendered (no tabs).

## Date and time inputs

String schemas with `format: "date"`, `format: "time"`, or `format: "date-time"` render as the corresponding HTML5 input types:

```tsx
const eventSchema = z.object({
  date: z.string().meta({ format: "date" }),
  startTime: z.string().meta({ format: "time" }),
  createdAt: z.string().meta({ format: "date-time" }),
});
```

This produces `<input type="date">`, `<input type="time">`, and `<input type="datetime-local">` respectively. In read-only mode, dates are formatted using `toLocaleDateString()` / `toLocaleString()`.

## Schema defaults

Default values from `z.string().default("hello")` or JSON Schema `"default": "hello"` are used when the `value` prop is `undefined`:

```tsx
const schema = z.object({
  name: z.string().default("World"),
  count: z.number().default(0),
});

// Renders with "World" and 0 pre-filled
<SchemaComponent schema={schema} />
```

Defaults propagate through nested objects — each field uses its own default independently.

## Server Components

For read-only rendering in a React Server Component, use `<SchemaView>`. It has zero hooks — no `useContext`, no `useMemo`, no `useCallback` — so it works without the `"use client"` directive.

```tsx
import { SchemaView } from "schema-components/react/SchemaView";

export default async function Page() {
  const user = await getUser();
  return <SchemaView schema={userSchema} value={user} />;
}
```

`SchemaView` always renders read-only. For editable forms, use `<SchemaComponent>` (which requires `"use client"`).

Pass the resolver explicitly since React context is unavailable in Server Components:

```tsx
import { SchemaView } from "schema-components/react/SchemaView";
import { shadcnResolver } from "schema-components/themes/shadcn";

<SchemaView schema={schema} value={data} resolver={shadcnResolver} />
```

`SchemaView` produces identical output to `<SchemaComponent readOnly>` — verified by parity tests.

## Error handling

Typed errors with `onError` callback for graceful degradation:

```tsx
import { SchemaErrorBoundary } from "schema-components/react/SchemaErrorBoundary";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

// Error boundary catches render errors from theme adapters
<SchemaErrorBoundary fallback={(error, reset) => <p>Error: {error.message}</p>}>
  <SchemaComponent schema={schema} value={data} />
</SchemaErrorBoundary>

// Per-component error callback
<SchemaComponent
  schema={schema}
  value={data}
  onError={(error) => {
    console.error(error);
    return null; // graceful degradation
  }}
/>
```

Without `onError`, errors re-throw. Error hierarchy: `SchemaError` → `SchemaNormalisationError` | `SchemaRenderError` | `SchemaFieldError`.

## Architecture

```
schema-components
├── core            # JSON Schema walker, ComponentResolver, RenderProps, typed errors, type guards
├── react           # SchemaComponent ("use client"), SchemaView (server component), headless renderer, error boundary
├── openapi         # Document parser, ApiOperation, ApiParameters, ApiRequestBody, ApiResponse
├── html            # h() builder, renderToHtml, streaming renderers, ARIA helpers
└── themes          # shadcn, MUI, custom adapters (separate packages)
```

Every module is imported directly — no barrel files. Organised exports:

```
schema-components/core/*         # Walker, types, guards, errors, resolver
schema-components/react/*        # SchemaComponent, SchemaView, SchemaErrorBoundary, headless
schema-components/openapi/*      # Parser, ApiOperation, ApiParameters, etc.
schema-components/html/*         # renderToHtml, renderToHtmlChunks, h() builder, styles
schema-components/themes/*       # shadcn, MUI, custom adapters
schema-components/styles.css     # Default stylesheet for HTML output
```
