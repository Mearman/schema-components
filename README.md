# schema-components

React components that render UI from Zod schemas, JSON Schema, and OpenAPI documents.

Define your data model once. Get presentational views, input fields, and editable forms — no manual wiring.

## Install

```bash
npm install @scalar/schema-components
```

Peer dependencies: `zod@^4.0.0`, `react@^18.0.0 || ^19.0.0`.

## Quick start

```tsx
import { z } from "zod";
import { SchemaComponent } from "@scalar/schema-components/react/SchemaComponent";

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
import { SchemaField } from "@scalar/schema-components/react/SchemaComponent";

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
import { ApiOperation } from "@scalar/schema-components/openapi/components";
import type { ApiRequestBodyProps } from "@scalar/schema-components/openapi/components";

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
import { SchemaProvider } from "@scalar/schema-components/react/SchemaComponent";
import { shadcnResolver } from "@scalar/schema-components/themes/shadcn";

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

Write a custom adapter:

```tsx
import type { RenderProps, ComponentResolver } from "@scalar/schema-components/core/renderer";

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
import { registerWidget } from "@scalar/schema-components/react/SchemaComponent";

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

## Architecture

```
@scalar/schema-components
├── core            # JSON Schema walker, ComponentResolver, RenderProps, type-level parsers
├── react           # SchemaComponent, SchemaProvider, SchemaField, headless renderer
├── openapi         # Document parser, ApiOperation, ApiParameters, ApiRequestBody, ApiResponse
└── themes          # shadcn, MUI, custom adapters (separate packages)
```

## Source files

Every module is imported directly — no barrel files.

| File | Role |
|---|---|
| `core/types.ts` | SchemaMeta, Editability, WalkedField, FieldOverrides, FromJSONSchema, PathOfType, OpenAPI type-level parsers |
| `core/walker.ts` | JSON Schema walker (Draft 2020-12), `$ref` resolution, `allOf` merging, nullable/discriminated union detection |
| `core/adapter.ts` | Normalises all inputs to JSON Schema (Zod via `z.toJSONSchema()`, JSON Schema passthrough, OpenAPI extraction) |
| `core/renderer.ts` | `ComponentResolver` interface, `RenderProps` with `renderChild` |
| `react/SchemaComponent.tsx` | Generic `<SchemaComponent<T, Ref>>`, `SchemaProvider`, `registerWidget`, `SchemaField<P>` |
| `react/headless.tsx` | Headless default resolver producing plain HTML |
| `openapi/parser.ts` | OpenAPI document parsing, operation extraction, `$ref` resolution |
| `openapi/components.tsx` | `ApiOperation`, `ApiParameters`, `ApiRequestBody`, `ApiResponse` with generic type inference |
