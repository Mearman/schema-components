/**
 * DocsPage decorator that renders an "API reference" section linking
 * each symbol declared in a story meta's `parameters.apiSymbols` to its
 * page on the hosted TypeDoc site.
 *
 * The lookup table is generated from `typedoc-static/project.json` by
 * `packages/core/scripts/build-api-urls.mjs` so we always have the real
 * kind (function, class, interface, …) needed to build a deep link,
 * rather than falling back to a search URL.
 *
 * Together with the existing `manager.tsx` toolbar button (which links
 * the TypeDoc root) this completes the bidirectional Storybook ↔ TypeDoc
 * cross-linking — the README inventory's Stories column points from
 * TypeDoc to Storybook, and this badge points the other way around.
 */

import type { CSSProperties } from "react";
import { DocsPage, useOf } from "@storybook/addon-docs/blocks";
import { apiUrls, type ApiPage } from "../src/generated/api-urls.ts";

/**
 * Extracts the `apiSymbols` array from a story's `parameters` field.
 * Storybook's own `Parameters` type is `Record<string, unknown>`, so we
 * narrow with `in` and `Array.isArray` rather than casting. TypeScript
 * picks up the property type after the `in` check, leaving only
 * primitive runtime checks to do.
 */
function extractApiSymbols(parameters: unknown): readonly string[] {
    if (typeof parameters !== "object" || parameters === null) return [];
    if (!("apiSymbols" in parameters)) return [];
    const raw = parameters.apiSymbols;
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is string => typeof entry === "string");
}

interface ResolvedSymbol {
    readonly name: string;
    /** `undefined` when the symbol is not present in the generated map. */
    readonly pages: readonly ApiPage[] | undefined;
}

function resolveSymbols(symbols: readonly string[]): readonly ResolvedSymbol[] {
    return symbols.map((name) => ({
        name,
        pages: apiUrls[name],
    }));
}

const containerStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.5rem",
    margin: "0 0 1.5rem",
    padding: "0.625rem 0.875rem",
    border: "1px solid var(--sc-border)",
    borderRadius: "0.5rem",
    background: "var(--sc-bg-secondary)",
    fontSize: "0.8125rem",
};

const labelStyle: CSSProperties = {
    fontWeight: 600,
    color: "var(--sc-text-secondary)",
    marginRight: "0.25rem",
};

const linkStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.125rem 0.5rem",
    border: "1px solid var(--sc-border)",
    borderRadius: "0.375rem",
    background: "var(--sc-bg)",
    color: "var(--sc-link)",
    textDecoration: "none",
    fontFamily:
        '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: "0.75rem",
    lineHeight: 1.4,
};

const missingStyle: CSSProperties = {
    ...linkStyle,
    color: "var(--sc-text-muted)",
    cursor: "not-allowed",
    fontStyle: "italic",
};

function formatLabel(
    name: string,
    page: ApiPage,
    pageCount: number,
): string {
    // When a symbol exists in multiple modules, distinguish the link by
    // its sub-path so readers can tell which export they will land on.
    if (pageCount > 1) {
        return `${name} (${page.modulePath})`;
    }
    return name;
}

function ApiSymbolLink({
    name,
    page,
    pageCount,
}: {
    readonly name: string;
    readonly page: ApiPage;
    readonly pageCount: number;
}) {
    return (
        <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
            title={`View ${page.name} (${page.kind}) in the TypeDoc API reference`}
        >
            <code style={{ background: "transparent", padding: 0 }}>
                {formatLabel(name, page, pageCount)}
            </code>
            <span aria-hidden="true">↗</span>
        </a>
    );
}

/**
 * Renders one badge per resolved symbol page, plus a non-clickable
 * placeholder for any symbol that is not yet covered by the generated
 * lookup (e.g. brand-new exports before `pnpm api-urls` has been run).
 */
function ApiReferenceBadge() {
    const resolved = useOf("story", ["story"]);
    const parameters =
        resolved.type === "story" ? resolved.story.parameters : undefined;
    const symbols = extractApiSymbols(parameters);
    if (symbols.length === 0) return null;

    const resolvedSymbols = resolveSymbols(symbols);

    return (
        <aside
            aria-label="API reference"
            data-api-reference-badge=""
            style={containerStyle}
        >
            <span style={labelStyle}>API reference</span>
            {resolvedSymbols.map((symbol) => {
                if (symbol.pages === undefined || symbol.pages.length === 0) {
                    return (
                        <span
                            key={symbol.name}
                            style={missingStyle}
                            title={`No TypeDoc page found for ${symbol.name} — re-run \`pnpm api-urls\` after \`pnpm typedoc\`.`}
                        >
                            <code
                                style={{ background: "transparent", padding: 0 }}
                            >
                                {symbol.name}
                            </code>
                        </span>
                    );
                }
                const pageCount = symbol.pages.length;
                return symbol.pages.map((page) => (
                    <ApiSymbolLink
                        key={`${symbol.name}::${page.modulePath}`}
                        name={symbol.name}
                        page={page}
                        pageCount={pageCount}
                    />
                ));
            })}
        </aside>
    );
}

/**
 * Custom DocsPage that prepends the API reference badge above the
 * default autodocs layout. Wired up via `parameters.docs.page` in
 * `preview.ts`.
 */
export function DocsPageWithApiBadge() {
    return (
        <>
            <ApiReferenceBadge />
            <DocsPage />
        </>
    );
}
