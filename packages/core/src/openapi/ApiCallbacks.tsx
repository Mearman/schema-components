/**
 * <ApiCallbacks> — renders OpenAPI callback definitions for an operation.
 *
 * Displays callback names and their operations,
 * read-only documentation style (no onChange).
 */

import type { ReactNode } from "react";
import type { CallbackInfo } from "./parser.ts";
import type { SchemaMeta } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiCallbacksProps {
    /** Callback definitions for this operation. */
    callbacks: CallbackInfo[];
    /** Optional meta overrides. */
    meta?: SchemaMeta;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiCallbacks({ callbacks }: ApiCallbacksProps): ReactNode {
    if (callbacks.length === 0) return null;

    return (
        <section data-callbacks>
            <h4>Callbacks</h4>
            {callbacks.map((callback) => (
                <div key={callback.name} data-callback={callback.name}>
                    <span data-callback-name>{callback.name}</span>
                    {callback.operations.map((op) => (
                        <div
                            key={`${op.method}-${op.path}`}
                            data-callback-operation
                        >
                            <span data-callback-method>
                                {op.method.toUpperCase()}
                            </span>{" "}
                            <span data-callback-path>{op.path}</span>
                            {op.summary && (
                                <span data-callback-summary>{op.summary}</span>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </section>
    );
}
