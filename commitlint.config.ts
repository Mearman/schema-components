import type { UserConfig } from "@commitlint/types";

/**
 * Commitlint configuration for schema-components.
 *
 * Enforces conventional commits with optional scope validation.
 * Format: type(scope): description
 *
 * Allowed scopes match the monorepo package structure.
 * Commits must use British English spelling and grammar.
 */
const config: UserConfig = {
    extends: ["@commitlint/config-conventional"],
    rules: {
        "scope-enum": [
            2,
            "always",
            [
                // Packages
                "core",
                "docs",
                // Core modules
                "react",
                "themes",
                "openapi",
                "html",
                // Build/tooling
                "build",
                "release",
                "ci",
                "deps",
            ],
        ],
    },
};

export default config;
