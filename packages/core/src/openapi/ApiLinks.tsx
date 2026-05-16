/**
 * <ApiLinks> — renders OpenAPI response link definitions.
 *
 * Displays link names, target operations, and parameter mappings,
 * read-only documentation style (no onChange).
 */

import type { ReactNode } from "react";
import type { LinkInfo } from "./parser.ts";
import type { SchemaMeta } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiLinksProps {
    /** Link definitions for a response. */
    links: LinkInfo[];
    /** Optional meta overrides. */
    meta?: SchemaMeta;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiLinks({ links }: ApiLinksProps): ReactNode {
    if (links.length === 0) return null;

    return (
        <section data-links>
            <h4>Links</h4>
            {links.map((link) => (
                <div key={link.name} data-link={link.name}>
                    <span data-link-name>{link.name}</span>
                    {link.operationId && (
                        <span data-link-operation-id>{link.operationId}</span>
                    )}
                    {link.operationRef && (
                        <span data-link-operation-ref>{link.operationRef}</span>
                    )}
                    {link.description && (
                        <span data-link-description>{link.description}</span>
                    )}
                    {link.parameters.size > 0 && (
                        <dl data-link-parameters>
                            {[...link.parameters.entries()].map(
                                ([paramName, paramValue]) => (
                                    <span
                                        key={paramName}
                                        data-link-parameter={paramName}
                                    >
                                        {paramName}: {paramValue}
                                    </span>
                                )
                            )}
                        </dl>
                    )}
                </div>
            ))}
        </section>
    );
}
