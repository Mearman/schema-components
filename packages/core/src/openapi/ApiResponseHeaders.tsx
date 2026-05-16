/**
 * <ApiResponseHeaders> — renders OpenAPI response header definitions.
 *
 * Displays header names, types, and descriptions,
 * read-only documentation style (no onChange).
 */

import type { ReactNode } from "react";
import type { HeaderInfo } from "./parser.ts";
import type { SchemaMeta } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiResponseHeadersProps {
    /** Header definitions for a response. */
    headers: Map<string, HeaderInfo>;
    /** Optional meta overrides. */
    meta?: SchemaMeta;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiResponseHeaders({
    headers,
}: ApiResponseHeadersProps): ReactNode {
    if (headers.size === 0) return null;

    return (
        <section data-response-headers>
            <h5>Headers</h5>
            {[...headers.entries()].map(([name, header]) => (
                <div key={name} data-header={name}>
                    <span data-header-name>{name}</span>
                    {header.description && (
                        <span data-header-description>
                            {header.description}
                        </span>
                    )}
                    {header.required && <span data-required>*</span>}
                    {header.deprecated && (
                        <span data-deprecated>Deprecated</span>
                    )}
                    {header.schema !== undefined &&
                    "type" in header.schema &&
                    typeof header.schema.type === "string" ? (
                        <span data-header-type>{header.schema.type}</span>
                    ) : undefined}
                </div>
            ))}
        </section>
    );
}
