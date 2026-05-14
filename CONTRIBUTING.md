# Contributing

## Setup

```bash
pnpm install
pnpm check       # typecheck + lint + build (core package)
pnpm test        # run all tests
```

## Project structure

```
packages/
  core/                 # Published as schema-components on npm
    src/
      core/             # JSON Schema walker, adapter, types, renderer
      react/            # SchemaComponent, headless renderer
      openapi/          # Parser, ApiOperation, ApiParameters, ApiRequestBody, ApiResponse
      html/             # HTML renderer, streaming, a11y
      themes/           # Theme adapters (shadcn, MUI)
    tests/
      *.unit.test.ts    # Unit tests (walker, adapter, parser)
      type-inference.test.ts  # Compile-time type inference tests
  docs/                 # Storybook documentation site
    stories/            # Storybook stories
    .storybook/         # Storybook configuration
```

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint:

```
feat: add new feature
fix: fix a bug
docs: documentation changes
refactor: code restructuring
test: adding or updating tests
build: build system or dependencies
ci: CI configuration
chore: maintenance, tooling
```

Scopes: `core`, `docs`, `react`, `themes`, `openapi`, `html`, `build`, `release`, `ci`, `deps`.

Commits are linted via husky + commitlint on `commit-msg`.

## Code style

- **No barrel files.** Custom ESLint rule bans `index.ts`/`index.tsx`. Every module imported directly.
- **No type assertions.** `consistent-type-assertions: "never"` — all narrowing via type guards and `Object.entries()`.
- **No `eslint-disable`.** `noInlineConfig: true` in ESLint config. Fix the lint error, don't suppress it.
- **British English.** Comments, commit messages, documentation.
- **`exactOptionalPropertyTypes: true`.** Optional props are `field?: T`, not `field?: T | undefined`.

## Testing

```bash
pnpm test                     # unit tests (core package)
pnpm --filter schema-components _test:e2e   # e2e tests
pnpm test:coverage            # tests with coverage
pnpm test-storybook           # Storybook component tests
```

Type inference tests live in `packages/core/tests/type-inference.test.ts`. They verify generic props dispatch at compile time — `@ts-expect-error` directives that should trigger, and valid assignments that should pass. If `_typecheck` passes, the type tests pass.

## Pull requests

- One logical change per PR.
- Atomic commits within the PR.
- All checks must pass: typecheck, lint, build, tests.
- No `--force-push` after review.
