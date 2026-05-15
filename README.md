# schema-components

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/Mearman/schema-components)
[![npm version](https://img.shields.io/npm/v/schema-components.svg)](https://www.npmjs.com/package/schema-components)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Mearman/schema-components/ci.yml?branch=main)](https://github.com/Mearman/schema-components/actions)
[![Storybook](https://img.shields.io/badge/Storybook-FF4785?logo=storybook&logoColor=white)](https://mearman.github.io/schema-components/)

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

## Examples

### All input formats

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

### OpenAPI operations

Render API operations with type-safe field overrides:

```tsx
import { ApiOperation } from "schema-components/openapi/components";

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
```

### Theme adapters

Headless by default (plain HTML). Wrap with a theme adapter for styled components:

```tsx
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { shadcnResolver } from "schema-components/themes/shadcn";

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
</SchemaProvider>
```

### Raw HTML (no React)

```tsx
import { renderToHtml } from "schema-components/html/renderToHtml";

const html = renderToHtml(userSchema, {
  value: { name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
  readOnly: true,
});
```

### Server Components

```tsx
import { SchemaView } from "schema-components/react/SchemaView";

export default async function Page() {
  const user = await getUser();
  return <SchemaView schema={userSchema} value={user} />;
}
```

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

---

## Repository structure

| Package | Description |
|---|---|
| [`packages/core`](packages/core/) | Published as `schema-components` on npm — the component library |
| [`packages/docs`](packages/docs/) | Storybook documentation site — not published |

## Development

```bash
pnpm install            # Install all workspace dependencies
pnpm build              # Build the core library
pnpm check              # Typecheck + lint + build
pnpm test               # Run unit tests
pnpm test:coverage      # Run tests with coverage
pnpm storybook          # Start Storybook dev server
pnpm build-storybook    # Build static Storybook site
```
