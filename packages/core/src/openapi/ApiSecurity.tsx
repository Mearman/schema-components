/**
 * <ApiSecurity> — renders OpenAPI security requirements and schemes.
 *
 * Displays the security schemes that apply to an operation,
 * read-only documentation style (no onChange).
 *
 * Renders every Security Scheme Object field defined by the OpenAPI 3.x
 * specification: `type`, `description`, `name`, `in`, `scheme`,
 * `bearerFormat`, `openIdConnectUrl`, and the full `flows` map for
 * OAuth 2 schemes (each flow's `authorizationUrl`, `tokenUrl`,
 * `refreshUrl`, and `scopes`).
 */

import type { ReactNode } from "react";
import type { SecurityRequirement, SecurityScheme } from "./parser.ts";
import type { JsonObject, SchemaMeta } from "../core/types.ts";
import { isObject } from "../core/guards.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiSecurityProps {
    /** Security requirements for this operation. */
    requirements: SecurityRequirement[];
    /** Security schemes from the document's components. */
    schemes: Map<string, SecurityScheme>;
    /** Optional meta overrides. */
    meta?: SchemaMeta;
}

// ---------------------------------------------------------------------------
// OAuth Flows extraction
// ---------------------------------------------------------------------------

/**
 * The four OAuth 2 flow keys defined by OpenAPI 3.x. Listed in the
 * canonical specification order so renders are deterministic.
 */
const OAUTH_FLOW_KEYS = [
    "implicit",
    "password",
    "clientCredentials",
    "authorizationCode",
] as const;

/**
 * Known Security Scheme `type` values per the OpenAPI 3.0/3.1 spec.
 * Used to flag unknown values in the rendered output so authors can
 * spot typos like `mutalTLS` without consulting the diagnostic sink.
 */
const KNOWN_SECURITY_SCHEME_TYPES = new Set([
    "apiKey",
    "http",
    "oauth2",
    "openIdConnect",
    "mutualTLS",
]);

type OAuthFlowKey = (typeof OAUTH_FLOW_KEYS)[number];

interface OAuthFlow {
    name: OAuthFlowKey;
    authorizationUrl: string | undefined;
    tokenUrl: string | undefined;
    refreshUrl: string | undefined;
    scopes: Map<string, string>;
}

function readString(source: JsonObject, key: string): string | undefined {
    const value = source[key];
    return typeof value === "string" ? value : undefined;
}

function readScopes(source: JsonObject): Map<string, string> {
    const scopes = source.scopes;
    const result = new Map<string, string>();
    if (!isObject(scopes)) return result;
    for (const [name, description] of Object.entries(scopes)) {
        if (typeof description !== "string") continue;
        result.set(name, description);
    }
    return result;
}

function extractFlows(flows: JsonObject | undefined): OAuthFlow[] {
    if (flows === undefined) return [];
    const result: OAuthFlow[] = [];
    for (const name of OAUTH_FLOW_KEYS) {
        const flow = flows[name];
        if (!isObject(flow)) continue;
        result.push({
            name,
            authorizationUrl: readString(flow, "authorizationUrl"),
            tokenUrl: readString(flow, "tokenUrl"),
            refreshUrl: readString(flow, "refreshUrl"),
            scopes: readScopes(flow),
        });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiSecurity({
    requirements,
    schemes,
}: ApiSecurityProps): ReactNode {
    if (requirements.length === 0) return null;

    return (
        <section data-security>
            <h4>Security</h4>
            {requirements.map((req, index) => {
                const scheme = schemes.get(req.name);
                return (
                    <div
                        key={`${req.name}-${String(index)}`}
                        data-security-scheme={req.name}
                    >
                        <span data-security-name>{req.name}</span>
                        {scheme !== undefined && (
                            <SchemeDetails scheme={scheme} />
                        )}
                        {req.scopes.length > 0 && (
                            <span data-security-scopes>
                                {req.scopes.join(", ")}
                            </span>
                        )}
                    </div>
                );
            })}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Scheme details
// ---------------------------------------------------------------------------

interface SchemeDetailsProps {
    scheme: SecurityScheme;
}

function SchemeDetails({ scheme }: SchemeDetailsProps): ReactNode {
    const flows = extractFlows(scheme.flows);
    const isKnownType =
        scheme.type !== undefined &&
        KNOWN_SECURITY_SCHEME_TYPES.has(scheme.type);
    return (
        <>
            {scheme.type !== undefined && (
                <span
                    data-security-type
                    data-security-type-unknown={
                        isKnownType ? undefined : "true"
                    }
                >
                    {scheme.type}
                    {!isKnownType && " (unknown type)"}
                </span>
            )}
            {scheme.description !== undefined && (
                <span data-security-description>{scheme.description}</span>
            )}
            {scheme.scheme !== undefined && (
                <span data-security-http-scheme>{scheme.scheme}</span>
            )}
            {scheme.bearerFormat !== undefined && (
                <span data-security-bearer-format>{scheme.bearerFormat}</span>
            )}
            {scheme.name !== undefined && (
                <span data-security-apikey-name>{scheme.name}</span>
            )}
            {scheme.location !== undefined && (
                <span data-security-apikey-in>{scheme.location}</span>
            )}
            {scheme.openIdConnectUrl !== undefined && (
                <a data-security-openid-url href={scheme.openIdConnectUrl}>
                    {scheme.openIdConnectUrl}
                </a>
            )}
            {flows.length > 0 && (
                <section data-security-flows>
                    {flows.map((flow) => (
                        <FlowDetails key={flow.name} flow={flow} />
                    ))}
                </section>
            )}
        </>
    );
}

// ---------------------------------------------------------------------------
// OAuth flow details
// ---------------------------------------------------------------------------

interface FlowDetailsProps {
    flow: OAuthFlow;
}

function FlowDetails({ flow }: FlowDetailsProps): ReactNode {
    return (
        <div data-security-flow={flow.name}>
            <span data-security-flow-name>{flow.name}</span>
            {flow.authorizationUrl !== undefined && (
                <a
                    data-security-flow-authorization-url
                    href={flow.authorizationUrl}
                >
                    {flow.authorizationUrl}
                </a>
            )}
            {flow.tokenUrl !== undefined && (
                <a data-security-flow-token-url href={flow.tokenUrl}>
                    {flow.tokenUrl}
                </a>
            )}
            {flow.refreshUrl !== undefined && (
                <a data-security-flow-refresh-url href={flow.refreshUrl}>
                    {flow.refreshUrl}
                </a>
            )}
            {flow.scopes.size > 0 && (
                <dl data-security-flow-scopes>
                    {[...flow.scopes.entries()].map(([name, description]) => (
                        <div key={name} data-security-flow-scope={name}>
                            <dt>{name}</dt>
                            <dd>{description}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}
