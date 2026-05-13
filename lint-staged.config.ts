/**
 * Lint-staged configuration for schema-components.
 *
 * Prettier runs as an ESLint rule via eslint-plugin-prettier,
 * so eslint --fix handles both linting and formatting.
 */
export default {
    "*.{ts,tsx}": ["eslint --cache --fix"],
};
