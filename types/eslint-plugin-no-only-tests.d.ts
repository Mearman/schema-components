/**
 * Local ambient declaration for `eslint-plugin-no-only-tests`.
 *
 * The upstream package ships only JSDoc casts to `eslint`'s `ESLint.Plugin`
 * type, so a default import resolves to `any` under the project's strict
 * configuration. This shim describes the actual runtime shape — a default
 * export carrying the single `no-only-tests` rule.
 */
declare module "eslint-plugin-no-only-tests" {
    import type { ESLint } from "eslint";

    const plugin: ESLint.Plugin;
    export default plugin;
}
