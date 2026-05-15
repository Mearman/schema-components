# schema-components

[![npm version](https://img.shields.io/npm/v/schema-components.svg)](https://www.npmjs.com/package/schema-components)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Mearman/schema-components/ci.yml?branch=main)](https://github.com/Mearman/schema-components/actions)

React components that render UI from Zod schemas, JSON Schema, and OpenAPI documents.

## Install

```bash
npm install schema-components
```

Peer dependencies: `zod@^4.0.0`, `react@^18.0.0 || ^19.0.0`.

## `SchemaComponent`

The single entry point. Accepts Zod schemas, JSON Schema objects, or OpenAPI documents:

```tsx
import { SchemaComponent } from "schema-components/react/SchemaComponent";

// Zod schema
<SchemaComponent schema={z.object({ name: z.string() })} value={data} />

// JSON Schema object
<SchemaComponent schema={{ type: "object", properties: { name: { type: "string" } } }} value={data} />

// OpenAPI document + ref
<SchemaComponent schema={openApiSpec} ref="#/components/schemas/User" value={data} />
```

### Props

| Prop | Type | Description |
|---|---|---|
| `schema` | `ZodType \| JSONObject \| OpenAPIDocument` | The schema to render |
| `value` | `unknown` | Current value for the schema |
| `onChange` | `(value: unknown) => void` | Callback when value changes |
| `readOnly` | `boolean` | Force read-only presentation |
| `writeOnly` | `boolean` | Force write-only (blank inputs) |
| `ref` | `string` | JSON Pointer into OpenAPI document |
| `fields` | `InferFields<T>` | Type-safe per-field overrides |
| `widgets` | `WidgetMap` | Instance-scoped widget overrides |
| `validate` | `boolean` | Enable Zod validation on change |
| `onValidationError` | `(error: unknown) => void` | Callback for validation errors |
| `onError` | `(error: SchemaError) => ReactNode \| void` | Per-component error handler |
| `resolver` | `ComponentResolver` | Theme adapter override |
| `meta` | `SchemaMeta` | Schema-level metadata override |

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

### `FieldOverride`

Each field override accepts:

| Property | Type | Description |
|---|---|---|
| `readOnly` | `boolean` | Override editability for this field |
| `writeOnly` | `boolean` | Override write-only state |
| `visible` | `boolean` | Hide the field entirely when `false` |
| `order` | `number` | Sort order within parent object |
| `onValidationError` | `(error: unknown) => void` | Per-field validation callback |
| `description` | `string` | Override label / description |
| `default` | `unknown` | Override default value |
| `component` | `string` | Widget name for custom rendering |

Plus any standard JSON Schema meta properties (`title`, `format`, `pattern`, etc.).

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

## OpenAPI components

Render API operations with type-safe field overrides:

```tsx
import {
  ApiOperation,
  ApiParameters,
  ApiRequestBody,
  ApiResponse,
} from "schema-components/openapi/components";

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
  }}
/>

// Just parameters with type-safe overrides
<ApiParameters
  schema={petStore}
  path="/pets"
  method="get"
  overrides={{
    limit: { description: "Max results" },
  }}
/>

// Response schema
<ApiResponse schema={petStore} path="/pets" method="get" status="200" />
```

## Theme adapters

Headless by default (plain HTML). Wrap with a theme adapter for styled components:

### shadcn/ui

```tsx
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { shadcnResolver } from "schema-components/themes/shadcn";

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

### MUI

```tsx
import { registerMuiComponents } from "schema-components/themes/mui";
import { shadcnResolver } from "schema-components/themes/shadcn";

// Register MUI components at app startup
registerMuiComponents();

// Use via SchemaProvider
<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

### Mantine

```tsx
import { registerMantineComponents } from "schema-components/themes/mantine";
import { shadcnResolver } from "schema-components/themes/shadcn";

registerMantineComponents();

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

### Radix Themes

```tsx
import { registerRadixComponents } from "schema-components/themes/radix";
import { shadcnResolver } from "schema-components/themes/shadcn";

registerRadixComponents();

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

### Custom adapter

```tsx
import type { RenderProps, ComponentResolver } from "schema-components/core/renderer";

const myResolver: ComponentResolver = {
  string: (props: RenderProps) => {
    if (props.readOnly) return <span>{props.value}</span>;
    return <input value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
  },
  object: (props: RenderProps) => {
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

## Custom widgets

Widgets let you override rendering for specific fields using `.meta({ component: name })`. Three scopes are available, checked in order:

1. **Instance** — `widgets` prop on `<SchemaComponent>`
2. **Context** — `widgets` prop on `<SchemaProvider>`
3. **Global** — `registerWidget()` for app-wide defaults

### Global registration

```tsx
import { registerWidget } from "schema-components/react/SchemaComponent";

registerWidget("richtext", ({ value, onChange }) => (
  <RichTextEditor value={value} onChange={onChange} />
));

const schema = z.object({
  bio: z.string().meta({ component: "richtext" }),
});
```

### Context-scoped widgets

```tsx
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import type { WidgetMap } from "schema-components/react/SchemaComponent";

const adminWidgets: WidgetMap = new Map([
  ["richtext", ({ value, onChange }) => <RichTextEditor value={value} onChange={onChange} />],
  ["avatar", ({ value, onChange }) => <AvatarUploader value={value} onChange={onChange} />],
]);

<SchemaProvider resolver={shadcnResolver} widgets={adminWidgets}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
  <SchemaComponent schema={profileSchema} value={profile} onChange={setProfile} />
</SchemaProvider>
```

### Instance-scoped widgets

```tsx
const formWidgets: WidgetMap = new Map([
  ["richtext", ({ value, onChange }) => <SimpleTextarea value={value} onChange={onChange} />],
]);

<SchemaComponent schema={formSchema} value={form} widgets={formWidgets} />
```

### Resolution order

```
.meta({ component }) hint → instance widgets → context widgets → global registerWidget() → theme adapter → headless default
```

### `WidgetMap` type

```tsx
import type { WidgetMap } from "schema-components/react/SchemaComponent";

// ReadonlyMap<string, (props: RenderProps) => unknown>
const widgets: WidgetMap = new Map([
  ["name", (props) => <MyInput {...props} />],
]);
```

Server Components: `<SchemaView>` accepts a `widgets` prop directly (no React context available):

```tsx
<SchemaView schema={schema} value={data} widgets={serverWidgets} />
```

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

### Per-field validation errors

Add `onValidationError` to individual field overrides to receive errors for specific fields:

```tsx
<SchemaComponent
  schema={userSchema}
  value={user}
  onChange={setUser}
  validate
  fields={{
    email: { onValidationError: (err) => setEmailError(err) },
    name: { onValidationError: (err) => setNameError(err) },
  }}
/>
```

Errors are dispatched based on Zod error paths. The root-level `onValidationError` still receives all errors.

## Field visibility

Hide fields conditionally using the `visible` override:

```tsx
<SchemaComponent
  schema={paymentSchema}
  value={payment}
  fields={{
    cardNumber: { visible: payment.method === "card" },
    sortCode: { visible: payment.method === "bank" },
  }}
/>
```

When `visible: false`, the field is completely removed — no label, no empty placeholder, no hidden input.

## Field ordering

Control the order fields appear in rendered objects using `order`:

```tsx
<SchemaComponent
  schema={userSchema}
  value={user}
  fields={{
    email: { order: 1 },
    name: { order: 2 },
    role: { order: 3 },
  }}
/>
```

Lower `order` values render first. Fields without `order` keep their insertion order and appear after ordered fields. Can also be set in schema metadata:

```tsx
const schema = z.object({
  summary: z.string().meta({ order: 1 }),
  title: z.string().meta({ order: 2 }),
});
```

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

## File uploads

String schemas with `format: "binary"` render as `<input type="file">`. Use `contentMediaType` to restrict accepted MIME types:

```tsx
const schema = z.object({
  avatar: z.string().meta({ format: "binary" }),
  resume: z.string().meta({ format: "binary", contentMediaType: "application/pdf" }),
});
```

In read-only mode, file fields display a static label ("File field") since there is no value to show. The `onChange` callback receives the `File` object from the browser.

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
<SchemaView schema={schema} value={data} resolver={shadcnResolver} />
```

`SchemaView` produces identical output to `<SchemaComponent readOnly>` — verified by parity tests.

## HTML rendering

Render schemas to HTML strings — no React needed. Useful for server-side rendering, email templates, static sites, and non-React environments.

```tsx
import { renderToHtml } from "schema-components/html/renderToHtml";

const html = renderToHtml(userSchema, {
  value: { name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
  readOnly: true,
});
```

All HTML output uses `sc-` prefixed classes for styling hooks. HTML is properly escaped by the serialiser.

A default stylesheet is included:

```html
<link rel="stylesheet" href="node_modules/schema-components/dist/html/styles.css">
```

Or import in JS:

```ts
import "schema-components/styles.css";
```

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

### Structured HTML construction

The HTML renderer uses a typed `h()` builder instead of string templates:

```ts
import { h, serialize, raw } from "schema-components/html/html";

const input = h("input", { type: "text", id: "name", value: userValue });
serialize(input); // → <input type="text" id="name" value="Ada">
```

The builder handles void elements, boolean attributes, fragments, and nested children.

### Accessibility

The HTML renderer produces WAI-ARIA-compliant markup:

| Attribute | When |
|---|---|
| `id="<key>"` | All editable inputs |
| `aria-required="true"` | Required fields |
| `aria-describedby="<id>-hint"` | Fields with constraints |
| `aria-readonly="true"` | Read-only presentation spans |
| `aria-label="<description>"` | Checkboxes |
| `role="group"` | Record containers |

## Error handling

Typed errors with `onError` callback for graceful degradation:

```tsx
import { SchemaErrorBoundary } from "schema-components/react/SchemaErrorBoundary";

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
