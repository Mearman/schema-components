/**
 * Preact entry point for the default headless `ComponentResolver`.
 *
 * The export is the React adapter export imported under the same name
 * and re-exported. The Preact entry point works because the consumer
 * aliases `react` to `preact/compat` in their bundler — see the
 * "Preact support" section of the README for the alias config required
 * in Vite, Next.js, and Node consumers.
 *
 * The `import` + plain `export { ... }` idiom below (rather than
 * `export { ... } from`) is deliberate: the project's lint rules ban
 * `export ... from` outside `index` files, so each binding is brought
 * into local scope before being exported.
 */

import { headlessResolver } from "../react/headless.tsx";

export { headlessResolver };
