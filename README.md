# schema-components

React components that render UI from Zod schemas, JSON Schema, and OpenAPI documents.

See [`packages/core/README.md`](packages/core/README.md) for full documentation.

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
