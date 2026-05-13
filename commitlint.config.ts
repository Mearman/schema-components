import type { UserConfig } from "@commitlint/types";

/**
 * Commitlint configuration for schema-components.
 *
 * Enforces conventional commits with optional scope validation.
 * Format: type(scope): description
 *
 * Allowed scopes match the package structure.
 * Commits must use British English spelling and grammar.
 */
const config: UserConfig = {
    extends: ["@commitlint/config-conventional"],
    rules: {
        "scope-enum": [
            2,
            "always",
            [
                // Package modules
                "core",
                "react",
                "themes",
                "openapi",
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
