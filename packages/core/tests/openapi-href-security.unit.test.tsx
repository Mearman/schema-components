/**
 * Security tests for anchor `href` rendering in the OpenAPI components.
 *
 * Five sites historically rendered an attacker-controlled URL as a live
 * `<a href=...>` without checking the scheme:
 *
 * - `ApiSecurity` — scheme.openIdConnectUrl
 * - `ApiSecurity` — flow.authorizationUrl
 * - `ApiSecurity` — flow.tokenUrl
 * - `ApiSecurity` — flow.refreshUrl
 * - `ExternalDocsLink` in `components.tsx` — externalDocs.url
 *
 * Each must now route the URL through `isSafeHyperlink` and degrade to
 * a `<span>` when the check fails. Schemes other than `http`/`https`
 * (most importantly `javascript:`, `vbscript:`, `data:`, `file:`) are
 * rejected as live links.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ApiOperation } from "../src/openapi/components.tsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOSTILE_URLS = [
    "javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
] as const;

function buildOidcDoc(url: string): Record<string, unknown> {
    return {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0" },
        paths: {
            "/items": {
                get: {
                    operationId: "list",
                    security: [{ oidc: [] }],
                    responses: { "200": { description: "ok" } },
                },
            },
        },
        components: {
            securitySchemes: {
                oidc: { type: "openIdConnect", openIdConnectUrl: url },
            },
        },
    };
}

function buildOAuthFlowDoc(
    flow: Record<string, unknown>
): Record<string, unknown> {
    return {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0" },
        paths: {
            "/items": {
                get: {
                    operationId: "list",
                    security: [{ oauth: [] }],
                    responses: { "200": { description: "ok" } },
                },
            },
        },
        components: {
            securitySchemes: {
                oauth: {
                    type: "oauth2",
                    flows: {
                        authorizationCode: flow,
                    },
                },
            },
        },
    };
}

function buildExternalDocsDoc(url: string): Record<string, unknown> {
    return {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0" },
        externalDocs: { url, description: "Look here" },
        paths: {
            "/items": {
                get: {
                    operationId: "list",
                    externalDocs: { url, description: "Look here" },
                    responses: { "200": { description: "ok" } },
                },
            },
        },
    };
}

/**
 * Assert that the rendered HTML does NOT carry an `href="<hostileUrl>"`
 * attribute. The literal scheme is enough — we do not need to inspect
 * the surrounding tag, because `href=` is exclusive to `<a>` / `<area>`
 * in the rendered surface.
 */
function expectNoLiveHref(html: string, hostileUrl: string): void {
    // Escape `&` for the `data:` case where the URL contains `<` (which
    // React HTML-escapes to `&lt;` in attribute output). Any `href=…`
    // referencing the hostile scheme is a regression.
    expect(html).not.toContain(`href="${hostileUrl}"`);
    expect(html).not.toContain(`href='${hostileUrl}'`);
}

// ---------------------------------------------------------------------------
// scheme.openIdConnectUrl
// ---------------------------------------------------------------------------

describe("ApiSecurity — openIdConnectUrl with hostile scheme", () => {
    it.each(HOSTILE_URLS)(
        "renders %s as a span, not an anchor",
        (hostileUrl) => {
            const html = renderToString(
                createElement(ApiOperation, {
                    schema: buildOidcDoc(hostileUrl),
                    path: "/items",
                    method: "get",
                })
            );
            expectNoLiveHref(html, hostileUrl);
            // The URL text should still appear so authors notice it.
            // The `<` in the `data:` URL is escaped to `&lt;` in HTML
            // text content. Strip the inner `<script>` for a stable
            // substring check.
            expect(html).toContain("data-security-openid-url");
        }
    );

    it("still emits an anchor for https URLs", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: buildOidcDoc(
                    "https://issuer.example.com/.well-known/openid-configuration"
                ),
                path: "/items",
                method: "get",
            })
        );
        expect(html).toContain(
            'href="https://issuer.example.com/.well-known/openid-configuration"'
        );
    });
});

// ---------------------------------------------------------------------------
// flow.authorizationUrl / tokenUrl / refreshUrl
// ---------------------------------------------------------------------------

describe("ApiSecurity — OAuth flow URLs with hostile scheme", () => {
    it.each(HOSTILE_URLS)(
        "renders %s as a span when in authorizationUrl",
        (hostileUrl) => {
            const html = renderToString(
                createElement(ApiOperation, {
                    schema: buildOAuthFlowDoc({
                        authorizationUrl: hostileUrl,
                        tokenUrl: "https://example.com/token",
                        scopes: {},
                    }),
                    path: "/items",
                    method: "get",
                })
            );
            expectNoLiveHref(html, hostileUrl);
            expect(html).toContain("data-security-flow-authorization-url");
        }
    );

    it.each(HOSTILE_URLS)(
        "renders %s as a span when in tokenUrl",
        (hostileUrl) => {
            const html = renderToString(
                createElement(ApiOperation, {
                    schema: buildOAuthFlowDoc({
                        authorizationUrl: "https://example.com/authorize",
                        tokenUrl: hostileUrl,
                        scopes: {},
                    }),
                    path: "/items",
                    method: "get",
                })
            );
            expectNoLiveHref(html, hostileUrl);
            expect(html).toContain("data-security-flow-token-url");
        }
    );

    it.each(HOSTILE_URLS)(
        "renders %s as a span when in refreshUrl",
        (hostileUrl) => {
            const html = renderToString(
                createElement(ApiOperation, {
                    schema: buildOAuthFlowDoc({
                        authorizationUrl: "https://example.com/authorize",
                        tokenUrl: "https://example.com/token",
                        refreshUrl: hostileUrl,
                        scopes: {},
                    }),
                    path: "/items",
                    method: "get",
                })
            );
            expectNoLiveHref(html, hostileUrl);
            expect(html).toContain("data-security-flow-refresh-url");
        }
    );

    it("still emits anchors for https flow URLs", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: buildOAuthFlowDoc({
                    authorizationUrl: "https://example.com/authorize",
                    tokenUrl: "https://example.com/token",
                    refreshUrl: "https://example.com/refresh",
                    scopes: {},
                }),
                path: "/items",
                method: "get",
            })
        );
        expect(html).toContain('href="https://example.com/authorize"');
        expect(html).toContain('href="https://example.com/token"');
        expect(html).toContain('href="https://example.com/refresh"');
    });
});

// ---------------------------------------------------------------------------
// externalDocs.url
// ---------------------------------------------------------------------------

describe("ExternalDocsLink — externalDocs.url with hostile scheme", () => {
    it.each(HOSTILE_URLS)(
        "renders %s as a span, not an anchor",
        (hostileUrl) => {
            const html = renderToString(
                createElement(ApiOperation, {
                    schema: buildExternalDocsDoc(hostileUrl),
                    path: "/items",
                    method: "get",
                })
            );
            expectNoLiveHref(html, hostileUrl);
            // The description label should still be visible.
            expect(html).toContain("Look here");
        }
    );

    it("still emits an anchor for https externalDocs", () => {
        const html = renderToString(
            createElement(ApiOperation, {
                schema: buildExternalDocsDoc("https://docs.example.com/"),
                path: "/items",
                method: "get",
            })
        );
        expect(html).toContain('href="https://docs.example.com/"');
    });
});
