/**
 * <ApiSecurity> — renders OpenAPI security requirements and schemes.
 *
 * Displays the security schemes that apply to an operation,
 * read-only documentation style (no onChange).
 */

import type { ReactNode } from "react";
import type { SecurityRequirement, SecurityScheme } from "./parser.ts";
import type { SchemaMeta } from "../core/types.ts";

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
                            <>
                                {scheme.type !== undefined && (
                                    <span data-security-type>
                                        {scheme.type}
                                    </span>
                                )}
                                {scheme.description && (
                                    <span data-security-description>
                                        {scheme.description}
                                    </span>
                                )}
                            </>
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
