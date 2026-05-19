/**
 * Local ambient declaration for `eslint-plugin-jsx-a11y`.
 *
 * The upstream package ships no `.d.ts`, so without this shim the plugin import
 * would resolve to `any` and violate the repo's `strictTypeChecked` ruleset.
 *
 * Only the surface used by `eslint.config.ts` is described here: the default
 * export is treated as an ESLint flat-config plugin (a `Linter.Plugin` from
 * `eslint`), and `flatConfigs.recommended` provides the prebuilt recommended
 * config object the project applies to `.tsx` files.
 */
declare module "eslint-plugin-jsx-a11y" {
    import type { Linter } from "eslint";

    interface JsxA11yPlugin extends Linter.Plugin {
        flatConfigs: {
            recommended: Linter.Config;
            strict: Linter.Config;
        };
    }

    const plugin: JsxA11yPlugin;
    export default plugin;
}
