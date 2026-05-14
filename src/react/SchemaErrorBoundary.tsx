"use client";

/**
 * React error boundary for schema-components.
 *
 * Catches render errors from `<SchemaComponent>`, theme adapters, and
 * any child components. Without this boundary, a throwing render function
 * crashes the entire React tree.
 *
 * Usage:
 *   import { SchemaErrorBoundary } from "schema-components/react/SchemaErrorBoundary";
 *
 *   <SchemaErrorBoundary fallback={(error) => <p>{error.message}</p>}>
 *     <SchemaComponent schema={userSchema} value={user} />
 *   </SchemaErrorBoundary>
 *
 * The boundary catches `SchemaRenderError` from theme adapters and any
 * other errors thrown during rendering. It does NOT catch:
 * - Event handler errors (onChange, etc.)
 * - Async errors
 * - Errors in server-side rendering
 */

import { Component, type ReactNode } from "react";
import { SchemaError } from "../core/errors.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaErrorBoundaryProps {
    /** Called with the caught error. Returns fallback ReactNode to render. */
    fallback: (error: Error, reset: () => void) => ReactNode;
    children: ReactNode;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
    error: Error | undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * React error boundary that catches schema rendering errors.
 *
 * Provides a `reset` callback that clears the error state, allowing
 * the children to re-render (e.g. after fixing a bad schema prop).
 */
export class SchemaErrorBoundary extends Component<
    SchemaErrorBoundaryProps,
    ErrorBoundaryState
> {
    state: ErrorBoundaryState = { error: undefined };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error): void {
        // If this is a SchemaError, the consumer's onError prop on
        // SchemaComponent already handled it. This boundary is for
        // render-time errors from theme adapters that escape that path.
        if (!(error instanceof SchemaError)) {
            console.error("[schema-components] Unhandled render error:", error);
        }
    }

    reset = (): void => {
        this.setState({ error: undefined });
    };

    render(): ReactNode {
        if (this.state.error !== undefined) {
            return this.props.fallback(this.state.error, this.reset);
        }
        return this.props.children;
    }
}
