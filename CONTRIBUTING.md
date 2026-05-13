# Contributing

## Setup

```bash
pnpm install
pnpm check       # typecheck + lint + build
pnpm test        # run all tests
```

## Project structure

```
src/
  core/           # JSON Schema walker, adapter, types, renderer
  react/          # SchemaComponent, headless renderer
  openapi/        # Parser, ApiOperation, ApiParameters, ApiRequestBody, ApiResponse
  themes/         # Theme adapters (shadcn, etc.)
tests/
  *.unit.test.ts  # Unit tests (walker, adapter, parser)
  type-inference.test.ts  # Compile-time type inference tests
```

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint:

```
feat: add new feature
fix: fix a bug
docs: documentation changes
refactor: code restructuring
test: adding or updating tests
chore: maintenance, tooling, CI
```

Commits are linted via husky + commitlint on `commit-msg`.

## Code style

- **No barrel files.** Custom ESLint rule bans `index.ts`/`index.tsx`. Every module imported directly.
- **No type assertions.** `consistent-type-assertions: "never"` — all narrowing via type guards and `Object.entries()`.
- **No `eslint-disable`.** `noInlineConfig: true` in ESLint config. Fix the lint error, don't suppress it.
- **British English.** Comments, commit messages, documentation.
- **`exactOptionalPropertyTypes: true`.** Optional props are `field?: T`, not `field?: T | undefined`.

## Testing

```bash
pnpm test              # all tests
pnpm _typecheck        # TypeScript only (includes type-inference tests)
pnpm _test              # runtime tests only
```

Type inference tests live in `tests/type-inference.test.ts`. They verify generic props dispatch at compile time — `@ts-expect-error` directives that should trigger, and valid assignments that should pass. If `_typecheck` passes, the type tests pass.

## Pull requests

- One logical change per PR.
- Atomic commits within the PR.
- All checks must pass: typecheck, lint, build, tests.
- No `--force-push` after review.
