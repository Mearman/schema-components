import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import type { Rule } from "eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslintPluginPrettier from "eslint-plugin-prettier";
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
    prettier: eslintPluginPrettier,
};

const sharedRules: Record<string, unknown> = {
    "custom/no-pointless-reassignments": "error",
    "custom/no-barrel-files": "error",
    "custom/no-re-exports": "error",
    "prettier/prettier": "error",
    "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
    ],
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
    eslintConfigPrettier
);
