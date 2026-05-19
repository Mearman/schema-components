/**
 * Preact entry point for `<SchemaComponent>`, `<SchemaProvider>`,
 * `<SchemaField>` and `registerWidget`.
 *
 * Every export below is the React adapter export imported under the
 * same name and re-exported. The Preact entry point works because the
 * consumer aliases `react` to `preact/compat` in their bundler — see
 * the "Preact support" section of the README for the alias config
 * required in Vite, Next.js, and Node consumers. Without the alias,
 * the React imports here resolve to the real React runtime, which
 * defeats the purpose of importing from the Preact entry point.
 *
 * Implementation note: the renderer tree is intentionally identical to
 * the React adapter. `preact/compat` translates React-style `onChange`
 * to `onInput`, matching the "fires on every keystroke" semantics that
 * the controlled inputs in `react/headlessRenderers.tsx` rely on.
 *
 * The `import` + plain `export { ... }` idiom below (rather than
 * `export { ... } from`) is deliberate: the project's lint rules ban
 * `export ... from` outside `index` files, so each binding is brought
 * into local scope before being exported.
 */

import {
    SchemaComponent,
    SchemaProvider,
    SchemaField,
    registerWidget,
} from "../react/SchemaComponent.tsx";
import type {
    SchemaComponentProps,
    SchemaFieldProps,
    InferFields,
    InferredOutputValue,
    InferredInputValue,
    InferredValue,
} from "../react/SchemaComponent.tsx";

export { SchemaComponent, SchemaProvider, SchemaField, registerWidget };
export type {
    SchemaComponentProps,
    SchemaFieldProps,
    InferFields,
    InferredOutputValue,
    InferredInputValue,
    InferredValue,
};
