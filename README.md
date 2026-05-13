# schema-components

React components that render UI from Zod schemas, JSON Schema, and OpenAPI documents.

Define your data model once. Get presentational views, input fields, and editable forms — no manual wiring.

## Install

```bash
npm install @scope/schema-components
```

Peer dependencies: `zod@^4.0.0`, `react@^18.0.0 || ^19.0.0`.

## Quick start

```tsx
import { z } from "zod";
import { SchemaComponent } from "@scope/schema-components/react";

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
Zod schema ──────────────────────────────────┐
                                              ▼
JSON Schema ─── z.fromJSONSchema() ─────► Zod schema ──► Zod-aware walker ──► React
                                              ▲
OpenAPI doc ── extract schemas ── z.fromJSONSchema() ──┘
```

Two paths in, one walker. The walker inspects Zod schemas directly via `._zod.def` — no JSON Schema in the rendering pipeline. `z.toJSONSchema()` is available for export (producing specs for external consumers) but is never used for rendering.

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

`readOnly: false` overrides the component-level `readOnly: true` for the `address` subtree. Its children inherit editable, and `city` re-applies presentation.

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

// Runtime schema — no autocomplete
const dynamicSchema = await fetch("/api/schema").then(r => r.json());
<SchemaComponent
  schema={dynamicSchema}
  fields={{ anyKey: { readOnly: true } }}   // any key accepted
/>
```

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

## Theme adapters

Headless by default (plain HTML). Wrap with a theme adapter for styled components:

```tsx
import { SchemaProvider } from "@scope/schema-components/react";
import { shadcnResolver } from "@scope/schema-components/themes/shadcn";

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

Write a custom adapter:

```tsx
import type { RenderProps, ComponentResolver } from "@scope/schema-components/core";

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

## Custom widgets

Register widgets by `.meta({ component })` hint:

```tsx
import { registerWidget } from "@scope/schema-components/react";

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

Validation uses `schema.safeParse()` — always available because the library always has a Zod schema internally.

## Individual fields

```tsx
import { SchemaField } from "@scope/schema-components/react";

<SchemaField
  path="address.city"
  schema={userSchema}
  value={user}
  onChange={setUser}
/>
```

## Architecture

```
@scope/schema-components
├── core            # Zod walker, ComponentResolver, RenderProps, type-level parsers
├── react           # SchemaComponent, SchemaProvider, SchemaField, headless renderer
├── themes          # shadcn, MUI, custom adapters (separate packages)
└── openapi         # OpenAPI document parsing, operation extraction
```

## Source files

Every module is imported directly — no barrel files.

| File | Role |
|---|---|
| `core/types.ts` | SchemaMeta, Editability, WalkedField, FieldOverrides, FromJSONSchema, ResolveOpenAPIRef |
| `core/walker.ts` | Zod 4 schema walker via `._zod.def`, nested field override resolution |
| `core/adapter.ts` | Normalises all inputs to Zod schemas via `z.fromJSONSchema()` |
| `core/renderer.ts` | `ComponentResolver` interface, `RenderProps` with `renderChild` |
| `react/SchemaComponent.tsx` | Generic `<SchemaComponent<T, Ref>>`, `SchemaProvider`, `registerWidget` |
| `react/headless.tsx` | Headless default resolver producing plain HTML |
| `openapi/parser.ts` | OpenAPI document parsing, operation extraction, `$ref` resolution |
