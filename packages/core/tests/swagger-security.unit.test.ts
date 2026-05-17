/**
 * Swagger 2.0 securityDefinitions translation.
 *
 * Swagger 2.0 represents `basic`, `oauth2`, and `apiKey` schemes in a
 * shape incompatible with OpenAPI 3.x. `normaliseSwagger2Document` must
 * translate each entry so the OpenAPI security renderer sees a
 * conforming 3.x shape regardless of the source document version.
 */

import { describe, it, expect } from "vitest";
import { normaliseOpenApiSchemas } from "../src/core/normalise.ts";
import { detectOpenApiVersion } from "../src/core/version.ts";
import { assertDefined } from "./helpers.ts";

function readSecuritySchemes(
    doc: Record<string, unknown>
): Record<string, unknown> {
    const version = detectOpenApiVersion(doc);
    const normalised = normaliseOpenApiSchemas(
        doc,
        assertDefined(version, "version")
    );
    const components = normalised.components;
    if (typeof components !== "object" || components === null) {
        throw new Error("normalised document has no components");
    }
    const componentsRecord = components as Record<string, unknown>;
    const schemes = componentsRecord.securitySchemes;
    if (typeof schemes !== "object" || schemes === null) {
        throw new Error("normalised document has no securitySchemes");
    }
    return schemes as Record<string, unknown>;
}

describe("Swagger 2.0 security scheme translation", () => {
    it("translates basic auth to http+basic", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                basicAuth: {
                    type: "basic",
                    description: "Basic auth",
                },
            },
        };

        const schemes = readSecuritySchemes(doc);
        expect(schemes.basicAuth).toStrictEqual({
            type: "http",
            scheme: "basic",
            description: "Basic auth",
        });
    });

    it("passes apiKey through unchanged in shape", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                key: {
                    type: "apiKey",
                    name: "X-API-Key",
                    in: "header",
                },
            },
        };

        const schemes = readSecuritySchemes(doc);
        expect(schemes.key).toStrictEqual({
            type: "apiKey",
            name: "X-API-Key",
            in: "header",
        });
    });

    it("translates oauth2 implicit flow", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                oauth: {
                    type: "oauth2",
                    flow: "implicit",
                    authorizationUrl: "https://example.com/authorize",
                    scopes: { read: "Read access" },
                },
            },
        };

        const schemes = readSecuritySchemes(doc);
        expect(schemes.oauth).toStrictEqual({
            type: "oauth2",
            flows: {
                implicit: {
                    authorizationUrl: "https://example.com/authorize",
                    scopes: { read: "Read access" },
                },
            },
        });
    });

    it("translates oauth2 password flow", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                oauth: {
                    type: "oauth2",
                    flow: "password",
                    tokenUrl: "https://example.com/token",
                    scopes: { write: "Write access" },
                },
            },
        };

        const schemes = readSecuritySchemes(doc);
        expect(schemes.oauth).toStrictEqual({
            type: "oauth2",
            flows: {
                password: {
                    tokenUrl: "https://example.com/token",
                    scopes: { write: "Write access" },
                },
            },
        });
    });

    it("translates oauth2 application flow to clientCredentials", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                oauth: {
                    type: "oauth2",
                    flow: "application",
                    tokenUrl: "https://example.com/token",
                    scopes: {},
                },
            },
        };

        const schemes = readSecuritySchemes(doc);
        expect(schemes.oauth).toStrictEqual({
            type: "oauth2",
            flows: {
                clientCredentials: {
                    tokenUrl: "https://example.com/token",
                    scopes: {},
                },
            },
        });
    });

    it("translates oauth2 accessCode flow to authorizationCode", () => {
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                oauth: {
                    type: "oauth2",
                    flow: "accessCode",
                    authorizationUrl: "https://example.com/authorize",
                    tokenUrl: "https://example.com/token",
                    scopes: { admin: "Admin access" },
                },
            },
        };

        const schemes = readSecuritySchemes(doc);
        expect(schemes.oauth).toStrictEqual({
            type: "oauth2",
            flows: {
                authorizationCode: {
                    authorizationUrl: "https://example.com/authorize",
                    tokenUrl: "https://example.com/token",
                    scopes: { admin: "Admin access" },
                },
            },
        });
    });

    it("does not share scope object reference between input and output", () => {
        // securityDefinitions must be deep-copied, not shallow-copied —
        // the historic bug being fixed shallow-spread the map and left
        // every scheme object (and its `scopes` map) shared with the
        // source document.
        const scopes = { read: "Read" };
        const doc: Record<string, unknown> = {
            swagger: "2.0",
            info: { title: "Test", version: "1.0.0" },
            paths: {},
            securityDefinitions: {
                oauth: {
                    type: "oauth2",
                    flow: "implicit",
                    authorizationUrl: "https://example.com/authorize",
                    scopes,
                },
            },
        };

        const schemes = readSecuritySchemes(doc);
        const oauth = schemes.oauth as Record<string, unknown>;
        const flows = oauth.flows as Record<string, unknown>;
        const implicit = flows.implicit as Record<string, unknown>;
        expect(implicit.scopes).not.toBe(scopes);
    });
});
