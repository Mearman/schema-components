# schema-components

React components that render UI from Zod schemas, JSON Schema, and OpenAPI documents.

Define your data model once. Get presentational views, input fields, and editable forms — no manual wiring.

## Install

```bash
npm install @scope/schema-components
```

Peer dependency: `zod@^4.0.0`.

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

Renders every field as an editable input. Add `.meta({ readOnly: true })` to the schema for a read-only view.

## How it works

```
Zod schema ──────────────────────────────────┐
                                              ▼
JSON Schema ─── z.fromJSONSchema() ─────► Zod schema ──► Zod-aware walker ──► React
                                              ▲
OpenAPI doc ── extract schemas ── z.fromJSONSchema() ──┘
```

Everything normalises to a Zod schema internally. The walker inspects `._zod.def` directly — no JSON Schema in the rendering path.

- **Zod schemas** → used directly
- **JSON Schema objects** → converted via `z.fromJSONSchema()`
- **OpenAPI documents** → schemas extracted from paths/operations/components, then converted via `z.fromJSONSchema()`

Validation is always available because the library always has a Zod schema on hand.

## Editability

There is no `mode` prop. Editability is controlled by `readOnly` and `writeOnly` from three sources:

1. **Schema property** — `.meta({ readOnly: true })` on a field, or `readOnly` on a JSON Schema property. Always overrides.
2. **Component props** — `readOnly` / `writeOnly` on `<SchemaComponent>`, or via the `meta` prop. Rendering context.
3. **Schema root** — `.meta({ readOnly: true })` on the root schema, or `readOnly` on the root JSON Schema. Fallback default.

Resolution per field (highest priority first):

| Priority | Source | Effect |
|---|---|---|
| 1 | Property `readOnly: true` | Always Presentation |
| 2 | Property `writeOnly: true` | Always Input |
| 3 | Component `readOnly` prop / `meta.readOnly` | Presentation default |
| 4 | Component `writeOnly` prop / `meta.writeOnly` | Input default |
| 5 | Schema root `readOnly` | Presentation default |
| 6 | Schema root `writeOnly` | Input default |
| 7 | Neither | Editable |

### `<SchemaComponent>` props

Every field in `SchemaMeta` is available as a top-level prop. Props and `meta` coexist, but the same field cannot be set in both — TypeScript enforces this:

```tsx
// Convenience props
<SchemaComponent schema={userSchema} value={user} readOnly />
<SchemaComponent schema={userSchema} onChange={setNewUser} writeOnly />

// Meta object — when you need more than one field
<SchemaComponent schema={userSchema} value={user} meta={{ readOnly: true, description: "Profile" }} />

// Mixed — fine, no overlap
<SchemaComponent schema={userSchema} value={user} readOnly description="Profile" />

// Error — readOnly set in both places
<SchemaComponent schema={userSchema} value={user} readOnly meta={{ readOnly: true }} />
```

### Examples

**Editable form with per-property overrides** (Zod):

```tsx
const userSchema = z.object({
  id: z.uuid().meta({ readOnly: true, description: "User ID" }),
  name: z.string().meta({ description: "Full name" }),
  password: z.string().min(8).meta({ writeOnly: true, description: "Password" }),
});

// No props → default is Editable
// id: Presentation (readOnly on property)
// password: Input (writeOnly on property)
// name: Editable
<SchemaComponent schema={userSchema} value={user} onChange={setUser} />
```

**Same schema, three contexts** — component props override schema root:

```tsx
// Profile card
<SchemaComponent schema={userSchema} value={user} readOnly />

// Settings form
<SchemaComponent schema={userSchema} value={user} onChange={setUser} />

// Create form
<SchemaComponent schema={userSchema} onChange={setNewUser} writeOnly />
```

**Read-only via schema root** (JSON Schema):

```json
{
  "readOnly": true,
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "id": { "type": "string", "format": "uuid" }
  }
}
```

**Per-property in JSON Schema / OpenAPI** — `readOnly` and `writeOnly` are native properties:

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid", "readOnly": true },
    "name": { "type": "string" },
    "password": { "type": "string", "writeOnly": true, "minLength": 8 }
  }
}
```

With JSON Schema / OpenAPI, `readOnly` and `writeOnly` are native properties — no extra configuration needed.

### Type-safe field overrides

The `fields` prop overrides `SchemaMeta` for individual properties. The type is inferred from the schema:

```tsx
// Zod — inferred from z.infer<T>
<SchemaComponent
  schema={userSchema}
  value={user}
  readOnly
  fields={{
    name: { description: "Full name" },              // type-safe
    address: {
      description: "Home address",
      city: { readOnly: false },                     // override root readOnly
    },
  }}
/>
```

```tsx
// JSON Schema (as const) — inferred from type-level parser
const jsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string", format: "email" },
  },
  required: ["name"],
} as const;

<SchemaComponent
  schema={jsonSchema}
  fields={{
    name: { description: "Full name" },        // type-safe
    email: { writeOnly: true },               // type-safe
  }}
/>
```

```tsx
// OpenAPI (as const + ref) — inferred from ref resolution
const spec = {
  openapi: "3.1.0",
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid", readOnly: true },
          name: { type: "string" },
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
    id: { readOnly: true },                // type-safe
    name: { description: "Full name" },    // type-safe
  }}
/>
```

Runtime schemas (fetched from an API) fall back to `Record<string, FieldOverride>` — no compile-time inference.

## Three input formats

### Zod schema

The richest input. `.meta()` UI hints, validation, and type inference work automatically.

```tsx
const schema = z.object({
  name: z.string().meta({ description: "Full name" }),
  email: z.email().meta({ description: "Email" }),
});

<SchemaComponent schema={schema} value={data} onChange={setData} validate />
```

### JSON Schema

Any valid JSON Schema object. The library calls `z.fromJSONSchema()` internally.

```tsx
const schema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Full name" },
    email: { type: "string", format: "email" },
  },
  required: ["name", "email"],
};

<SchemaComponent schema={schema} value={data} onChange={setData} />
```

### OpenAPI document

Full OpenAPI 3.x documents. Use `<SchemaComponent>` with a `ref` to target a specific schema, or use the operation-level components.

```tsx
import { ApiOperation, ApiRequestBody, ApiResponse } from "@scope/schema-components/openapi";

const spec = await fetch("/api/openapi.json").then(r => r.json());

// Target a component schema
<SchemaComponent schema={spec} ref="#/components/schemas/User" value={data} />

// Render a whole operation
<ApiOperation spec={spec} path="/users/{userId}" method="put" />

// Individual parts
<ApiRequestBody spec={spec} path="/users" method="post" />
<ApiResponse spec={spec} path="/users/{userId}" method="get" status="200" />
```

## Validation

Add the `validate` prop to any `<SchemaComponent>`. The library calls `.safeParse()` on the internal Zod schema and surfaces errors via `onValidationError`.

```tsx
<SchemaComponent
  schema={userSchema}
  value={data}
  onChange={setData}
 
  validate
  onValidationError={(error) => {
    // ZodError with per-field issues
  }}
/>
```

Works for all input formats — the library always has a Zod schema available.

## UI hints with `.meta()`

Use Zod 4's `.meta()` to pass rendering hints to theme adapters and custom widgets:

```tsx
const schema = z.object({
  name: z.string().meta({ description: "Full name", colSpan: 2 }),
  bio: z.string().meta({ description: "Biography", component: "richtext" }),
  role: z.enum(["admin", "editor"]).meta({ component: "radio-group" }),
  avatar: z.url().meta({ component: "image-picker", width: 128, height: 128 }),
});
```

`description` is used as the accessible field label. Custom keys are passed through to theme adapters.

## Custom widgets

Register renderers for specific component hints:

```tsx
import { registerWidget } from "@scope/schema-components/react";

registerWidget("richtext", ({ value, onChange }) => (
  <RichTextEditor value={value} onChange={onChange} />
));

registerWidget("colour-picker", ({ value, onChange }) => (
  <ColourPicker value={value} onChange={onChange} />
));
```

Resolution order: `.meta({ component })` → registered widget → theme adapter → headless default.

## Theme adapters

Headless by default. Ship your own UI or install a theme adapter.

```tsx
// shadcn/ui
import { ShadcnTheme } from "@scope/schema-components/themes/shadcn";
<ShadcnTheme><SchemaComponent ... /></ShadcnTheme>

// MUI
import { MuiTheme } from "@scope/schema-components/themes/mui";
<MuiTheme><SchemaComponent ... /></MuiTheme>

// Custom
import type { ComponentResolver } from "@scope/schema-components/core";
const myResolver: ComponentResolver = { /* ... */ };
<SchemaProvider resolver={myResolver}><App /></SchemaProvider>
```

## Schema → component mapping

| Zod type                   | Presentation              | Input                       | Editable                      |
|----------------------------|---------------------------|-----------------------------|-------------------------------|
| `z.string()`              | Text                      | `<input>` + placeholder     | `<input>` pre-filled         |
| `z.email()`               | Mailto link               | `<input type="email">`      | `<input type="email">`      |
| `z.url()`                 | Clickable link            | `<input type="url">`        | `<input type="url">`        |
| `z.iso.date()`            | Locale date               | `<input type="date">`       | `<input type="date">`       |
| `z.iso.datetime()`        | Locale datetime           | `<input type="datetime">`   | `<input type="datetime">`   |
| `z.uuid()`                | Truncated text            | `<input>` + mask            | `<input>` pre-filled         |
| `z.number()` / `z.int()`  | Formatted number          | `<input type="number">`     | `<input type="number">`     |
| `z.boolean()`             | Yes/No badge              | Unchecked checkbox          | Checkbox / toggle             |
| `z.enum([...])`           | Badge / label             | `<select>` + "Select…"      | `<select>` pre-selected      |
| `z.array(...)`            | List / chips              | Empty repeatable editor     | Repeatable item editor        |
| `z.object({...})`         | Key-value card            | Empty fieldset              | Nested fieldset               |
| `z.record(...)`           | Key-value list            | "No entries" + add button   | Dynamic key-value editor      |
| `z.file()`                | File name + size          | `<input type="file">`       | `<input type="file">`       |
| `z.discriminatedUnion()`  | Tabbed panels             | Tabbed blank inputs         | Tabbed inputs                 |
| `z.codec(...)`            | Output type (e.g. Date)   | Input type (e.g. ISO string) | Input type pre-filled        |

## Individual fields

Use `<SchemaField>` for specific fields in hand-written layouts:

```tsx
<SchemaField
  path="email"
  schema={userSchema}
  value={user}
  onChange={setUser}
 
/>
```

Or override rendering for a single field inside a `<SchemaComponent>`:

```tsx
<SchemaComponent schema={userSchema} value={user} onChange={setUser}>
  <SchemaField
    path="role"
   
    render={({ value, onChange }) => (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="admin">Admin</option>
        <option value="editor">Editor</option>
      </select>
    )}
  />
</SchemaComponent>
```

## Accessibility

- Labels from `description` via `<label>` / `aria-labelledby`
- `aria-invalid` + `aria-describedby` on validation errors
- Keyboard: Enter/double-click to activate edit, Escape to cancel, Tab between fields
- `role="tablist"` / `"tabpanel"` for discriminated union tabs
- `aria-label` on array add/remove buttons

## SSR / React Server Components

Schemas with `readOnly` (Presentation) render in Server Components — no `"use client"` needed. Schemas without `readOnly` (Editable fields) require client components.

```tsx
// page.tsx (Server Component)
<SchemaComponent schema={userSchema} value={user} />

// EditableProfile.tsx ("use client")
"use client";
<SchemaComponent schema={userSchema} value={draft} onChange={setDraft} validate />
```

## Form library integration

The `value`/`onChange` contract works with every form library:

```tsx
// react-hook-form
<Controller
  control={control}
  name="root"
  render={({ field: { value, onChange } }) => (
    <SchemaComponent schema={userSchema} value={value} onChange={onChange} validate />
  )}
/>
```

No adapter package needed.

## Package structure

```
@scope/schema-components
├── core            # Zod schema walker, component resolver, editability resolution
├── react           # <SchemaComponent>, <SchemaField>, hooks
├── themes          # headless by default; optional shadcn, MUI, etc.
└── openapi         # OpenAPI document parsing, operation/component resolution
```

## Acknowledgements

- [Zod](https://zod.dev/) — schema definition, validation, and JSON Schema conversion
- [react-jsonschema-form (RJSF)](https://rjsf-team.github.io/react-jsonschema-form/) — inspiration for schema-driven form rendering
- [Uniforms](https://uniforms.tools/) — theme-adapter pattern

## Licence

MIT
