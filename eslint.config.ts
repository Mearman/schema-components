import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import type { Rule } from "eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import importPlugin from "eslint-plugin-import";
// eslint-plugin-jsx-a11y and eslint-plugin-no-only-tests both ship without
// usable `.d.ts` files. Local ambient declarations in `types/` describe the
// surface used by this config (default-export ESLint plugins).
import jsxA11y from "eslint-plugin-jsx-a11y";
import noOnlyTests from "eslint-plugin-no-only-tests";
import eslintPluginPrettier from "eslint-plugin-prettier";
import eslintPluginTsdoc from "eslint-plugin-tsdoc";
import { configs } from "typescript-eslint";

const noPointlessReassignments: Rule.RuleModule = {
    meta: {
        type: "problem",
        fixable: "code",
        messages: {
            pointlessReassignment:
                "Pointless reassignment: '{{ name }}' is just an alias for '{{ value }}'. Use the original directly.",
        },
        docs: {
            description:
                "Bans const x = y aliases where no transformation occurs — use the original identifier directly.",
        },
    },
    create(context) {
        return {
            VariableDeclarator(node) {
                if (
                    node.id.type !== "Identifier" ||
                    node.init?.type !== "Identifier" ||
                    node.id.name.startsWith("_")
                ) {
                    return;
                }

                // Only flag const — let/var aliases are often intentional mutable copies.
                if (
                    node.parent.type !== "VariableDeclaration" ||
                    node.parent.kind !== "const"
                ) {
                    return;
                }

                const aliasName = node.id.name;
                const originalName = node.init.name;

                context.report({
                    node,
                    messageId: "pointlessReassignment",
                    data: { name: aliasName, value: originalName },
                    fix(fixer) {
                        const scope = context.sourceCode.getScope(node);
                        const variable = scope.set.get(aliasName);
                        if (!variable) return null;

                        // Abort if the alias is mutated after the initial write.
                        const mutationRefs = variable.references.filter(
                            (r) => r.isWrite() && r.identifier !== node.id
                        );
                        if (mutationRefs.length > 0) return null;

                        // Collect all read references for replacement.
                        const readRefs = variable.references.filter((r) =>
                            r.isRead()
                        );

                        // Abort when any read is a shorthand property ({ x } from const x = y).
                        const hasShorthand = readRefs.some((r) => {
                            const afterToken = context.sourceCode.getTokenAfter(
                                r.identifier
                            );
                            if (afterToken?.value === ":") return false;
                            if (
                                afterToken?.value !== "}" &&
                                afterToken?.value !== ","
                            )
                                return false;
                            let tok = context.sourceCode.getTokenBefore(
                                r.identifier
                            );
                            while (tok) {
                                if (tok.value === "{") return true;
                                if (tok.value === "[" || tok.value === "(")
                                    return false;
                                if (tok.value === ":") return false;
                                tok = context.sourceCode.getTokenBefore(tok);
                            }
                            return false;
                        });
                        if (hasShorthand) return null;

                        const fixes = readRefs.map((r) =>
                            fixer.replaceText(r.identifier, originalName)
                        );

                        // Remove the VariableDeclaration only when this is the sole declarator.
                        const declaration = node.parent;
                        if (
                            declaration.type !== "VariableDeclaration" ||
                            declaration.declarations.length !== 1
                        ) {
                            return null;
                        }
                        fixes.push(fixer.remove(declaration));
                        return fixes;
                    },
                });
            },
        };
    },
};

const noBarrelFiles: Rule.RuleModule = {
    meta: {
        type: "problem",
        messages: {
            noBarrelFile:
                "Barrel files (index.ts/index.tsx) are banned. Every module should be imported directly by its name, not re-exported through a barrel.",
        },
        docs: {
            description:
                "Bans barrel files (index.ts / index.tsx) — every module is imported directly.",
        },
    },
    create(context) {
        const filename = context.filename;
        if (filename.endsWith("/index.ts") || filename.endsWith("/index.tsx")) {
            return {
                Program(node) {
                    context.report({
                        node,
                        messageId: "noBarrelFile",
                    });
                },
            };
        }
        return {};
    },
};

const configFiles = [
    "eslint.config.ts",
    "commitlint.config.ts",
    "release.config.ts",
    "lint-staged.config.ts",
    "packages/core/tsdown.config.ts",
    "packages/docs/.storybook/main.ts",
    "packages/docs/.storybook/preview.ts",
    "packages/docs/.storybook/vitest.setup.ts",
    "packages/core/vitest.config.ts",
    "packages/docs/vitest.config.ts",
];

// ---------------------------------------------------------------------------
// No re-exports rule — bans export ... from in non-index files
// ---------------------------------------------------------------------------

const noReExports: Rule.RuleModule = {
    meta: {
        type: "problem",
        messages: {
            noReExport:
                "Re-exports (export ... from) are only allowed in index files. Import directly from the source module instead.",
        },
        docs: {
            description:
                "Bans re-exports in non-index files — every module should be imported directly from its source.",
        },
    },
    create(context) {
        const filename = context.filename;
        const isIndex = /(^|\/)index\.[cm]?[jt]sx?$/.test(
            filename.split("/").pop() ?? ""
        );

        if (isIndex) {
            return {};
        }

        return {
            ExportNamedDeclaration(node) {
                if (node.source) {
                    context.report({ node, messageId: "noReExport" });
                }
            },
            ExportAllDeclaration(node) {
                context.report({ node, messageId: "noReExport" });
            },
        };
    },
};

const sharedPluginRules = {
    custom: {
        rules: {
            "no-pointless-reassignments": noPointlessReassignments,
            "no-barrel-files": noBarrelFiles,
            "no-re-exports": noReExports,
        },
    },
    import: importPlugin,
    "no-only-tests": noOnlyTests,
    prettier: eslintPluginPrettier,
    tsdoc: eslintPluginTsdoc,
};

const sharedRules: Record<string, unknown> = {
    "custom/no-pointless-reassignments": "error",
    "custom/no-barrel-files": "error",
    "custom/no-re-exports": "error",
    "prettier/prettier": "error",
    "tsdoc/syntax": "warn",
    "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
    ],
    // Catch missing union members in `switch` statements (e.g. a new
    // `WalkedField.type` variant added without updating every dispatcher).
    // `requireDefaultForNonUnion: false` keeps switches on plain numbers /
    // strings exempt; only discriminated-union switches must be exhaustive.
    "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
            allowDefaultCaseForExhaustiveSwitch: true,
            requireDefaultForNonUnion: false,
        },
    ],
};

// Layer-boundary table for `import/no-restricted-paths`.
//
// The library is organised as a hub-and-spokes architecture: `core` carries
// the schema walker and shared primitives, and `react`, `openapi`, `html`,
// and `themes` are leaf consumers. The forbidden direction in every entry
// below is "downstream layer → sibling leaf layer" or "leaf layer → core".
//
// Each zone uses absolute `target` paths (resolved against the repo root via
// `tsconfigRootDir` semantics — see the `basePath` option below).
const layerBoundaryZones: ReadonlyArray<{
    target: string;
    from: string[];
    message: string;
}> = [
    {
        target: "./packages/core/src/core",
        from: [
            "./packages/core/src/react",
            "./packages/core/src/openapi",
            "./packages/core/src/html",
            "./packages/core/src/themes",
        ],
        message:
            "core/ must not import from sibling layers — it is the shared foundation every other layer depends on.",
    },
    {
        target: "./packages/core/src/openapi",
        from: [
            "./packages/core/src/react",
            "./packages/core/src/html",
            "./packages/core/src/themes",
        ],
        message:
            "openapi/ must not import from react/, html/, or themes/. Move the dependency into core/.",
    },
    {
        target: "./packages/core/src/react",
        from: [
            "./packages/core/src/openapi",
            "./packages/core/src/html",
            "./packages/core/src/themes",
        ],
        message:
            "react/ must not import from openapi/, html/, or themes/. Move the dependency into core/.",
    },
    {
        target: "./packages/core/src/html",
        from: [
            "./packages/core/src/react",
            "./packages/core/src/openapi",
            "./packages/core/src/themes",
        ],
        message:
            "html/ must not import from react/, openapi/, or themes/. Move the dependency into core/.",
    },
    {
        target: "./packages/core/src/themes",
        from: [
            "./packages/core/src/openapi",
            "./packages/core/src/html",
        ],
        message:
            "themes/ must not import from openapi/ or html/. Theme adapters belong on the React side of the renderer surface.",
    },
];

const noRestrictedPathsOption = {
    basePath: import.meta.dirname,
    zones: layerBoundaryZones.flatMap(({ target, from, message }) =>
        from.map((source) => ({ target, from: source, message }))
    ),
};

export default defineConfig(
    { ignores: ["dist/", "node_modules/", "**/node_modules/", "**/dist/", "storybook-static/"] },

    // Source and test files — packages/core
    {
        files: [
            "packages/core/src/**/*.ts",
            "packages/core/src/**/*.tsx",
            "packages/core/tests/**/*.ts",
            "packages/core/tests/**/*.tsx",
        ],
        extends: [
            eslint.configs.recommended,
            ...configs.strictTypeChecked,
            ...configs.stylisticTypeChecked,
        ],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: sharedPluginRules,
        rules: sharedRules,
    },

    // Story files — packages/docs
    {
        files: [
            "packages/docs/stories/**/*.ts",
            "packages/docs/stories/**/*.tsx",
            "packages/docs/.storybook/**/*.ts",
        ],
        extends: [
            eslint.configs.recommended,
            ...configs.strictTypeChecked,
            ...configs.stylisticTypeChecked,
        ],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: sharedPluginRules,
        rules: sharedRules,
    },

    // Test-specific overrides
    {
        files: ["packages/core/tests/**/*.ts", "packages/core/tests/**/*.tsx"],
        rules: {
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/consistent-type-assertions": "off",
            // Catch focused `it.only` / `describe.only` / `test.only` calls
            // that would silently skip the rest of the suite in CI.
            "no-only-tests/no-only-tests": "error",
        },
    },

    // Config files — no tsconfig, use allowDefaultProject
    {
        files: configFiles,
        extends: [
            eslint.configs.recommended,
            ...configs.strictTypeChecked,
            ...configs.stylisticTypeChecked,
        ],
        languageOptions: {
            parserOptions: {
                projectService: { allowDefaultProject: configFiles },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: sharedPluginRules,
        rules: sharedRules,
    },

    {
        files: [
            "packages/core/src/**/*.ts",
            "packages/core/src/**/*.tsx",
            "packages/core/tests/**/*.ts",
            "packages/core/tests/**/*.tsx",
            "packages/docs/stories/**/*.ts",
            "packages/docs/stories/**/*.tsx",
            "packages/docs/.storybook/**/*.ts",
        ],
        linterOptions: {
            noInlineConfig: true,
        },
    },

    // jsx-a11y recommended — applied to TSX files only.
    // The recommended config sets plugin + rules but no `files` filter; restrict
    // it here so the rules don't fire against plain .ts modules.
    {
        files: [
            "packages/core/src/**/*.tsx",
            "packages/core/tests/**/*.tsx",
            "packages/docs/stories/**/*.tsx",
        ],
        ...jsxA11y.flatConfigs.recommended,
    },

    // jsx-a11y overrides — temporary downgrades for in-flight a11y work.
    // The W4 worktree is sweeping `aria-readonly` off non-supporting elements
    // (e.g. `<a>` with the implicit `link` role) and reworking the tablist
    // focus model. Once W4 lands, drop this block and elevate both rules back
    // to `error` via the recommended config.
    {
        files: [
            "packages/core/src/**/*.tsx",
            "packages/core/tests/**/*.tsx",
            "packages/docs/stories/**/*.tsx",
        ],
        rules: {
            // TODO: elevate to `error` after W4 removes `aria-readonly` from
            // `<a>` (and updates the tests asserting its presence).
            "jsx-a11y/role-supports-aria-props": "warn",
            // TODO: elevate to `error` after W4 finalises the tablist focus
            // model — the inner tab buttons are focusable, but the tablist
            // container itself currently is not.
            "jsx-a11y/interactive-supports-focus": "warn",
        },
    },

    // Layer-boundary enforcement — see `layerBoundaryZones` above.
    // Applied to `packages/core/src/**` only; tests are allowed to cross
    // layers because integration assertions naturally span them.
    //
    // Severity is `warn`, not `error`, until the W3 worktree finishes moving
    // shared render helpers (`WidgetMap`, `joinPath`, `renderField`,
    // `sanitisePrefix`) from `react/SchemaComponent.tsx` into `core/`. The
    // project bans inline `eslint-disable` comments via `noInlineConfig`, so
    // a targeted downgrade is the cleanest deferral mechanism here.
    {
        files: [
            "packages/core/src/**/*.ts",
            "packages/core/src/**/*.tsx",
        ],
        rules: {
            // TODO: elevate to `error` after W3 moves the shared render
            // helpers out of `react/SchemaComponent.tsx`. The two surviving
            // violations in `openapi/components.tsx` will disappear then.
            "import/no-restricted-paths": ["warn", noRestrictedPathsOption],
        },
    },
    eslintConfigPrettier
);
