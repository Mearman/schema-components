/**
 * Lint-staged configuration for schema-components monorepo.
 *
 * Prettier runs as an ESLint rule via eslint-plugin-prettier,
 * so eslint --fix handles both linting and formatting.
 */
export default {
    "packages/core/src/**/*.{ts,tsx}": [
        "eslint --cache --fix",
    ],
    "packages/core/tests/**/*.{ts,tsx}": [
        "eslint --cache --fix",
    ],
    "packages/docs/stories/**/*.{ts,tsx}": [
        "eslint --cache --fix",
    ],
    "packages/docs/.storybook/**/*.ts": [
        "eslint --cache --fix",
    ],
};
