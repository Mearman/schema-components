/**
 * Preact entry point for `<SchemaView>` — the read-only renderer.
 *
 * The export is the React adapter export imported under the same name
 * and re-exported. The Preact entry point works because the consumer
 * aliases `react` to `preact/compat` in their bundler — see the
 * "Preact support" section of the README for the alias config required
 * in Vite, Next.js, and Node consumers.
 *
 * Limitation: React Server Components is React-only. Under Preact,
 * `<SchemaView>` runs as a client component and the zero-client-JS
 * deployment story documented in the React README does not apply.
 *
 * The `import` + plain `export { ... }` idiom below (rather than
 * `export { ... } from`) is deliberate: the project's lint rules ban
 * `export ... from` outside `index` files, so each binding is brought
 * into local scope before being exported.
 */

import { SchemaView } from "../react/SchemaView.tsx";
import type { SchemaViewProps } from "../react/SchemaView.tsx";

export { SchemaView };
export type { SchemaViewProps };
