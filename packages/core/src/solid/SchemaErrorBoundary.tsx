/** @jsxImportSource solid-js */
/**
 * Solid error boundary for schema-components.
 *
 * Wraps children in Solid's built-in `<ErrorBoundary>` and forwards the
 * caught error to a consumer-supplied `fallback` callback. Catches
 * render errors from `<SchemaComponent>`, theme adapters, and any
 * descendant — without this boundary, a throwing render function
 * propagates to the nearest enclosing root and tears down the entire
 * subtree.
 *
 * `SchemaError` instances (the structured failures emitted by
 * `<SchemaComponent>`'s normalisation and validation pipeline) are
 * routed without console noise — the consumer's `onError` prop on the
 * upstream `<SchemaComponent>` already handled them. Other errors are
 * logged once to `console.error` for unhandled-failure visibility,
 * matching the React adapter's behaviour.
 *
 * Does not catch:
 * - Errors thrown from event handlers (onChange, etc.).
 * - Asynchronous errors.
 * - Errors in server-side rendering (Solid Start has its own model).
 */

import { ErrorBoundary, type JSX } from "solid-js";
import { SchemaError } from "../core/errors.ts";

/**
 * Props accepted by {@link SchemaErrorBoundary}.
 *
 * @group Components
 */
export interface SchemaErrorBoundaryProps {
    /**
     * Called with the caught error and a `reset` callback that clears
     * the error state so children can re-mount. Mirrors the React
     * adapter's signature.
     */
    fallback: (error: Error, reset: () => void) => JSX.Element;
    children: JSX.Element;
}

/**
 * Catch rendering errors from `<SchemaComponent>`, theme adapters, and
 * any descendant. Wraps Solid's built-in `<ErrorBoundary>` so the API
 * shape matches `react/SchemaErrorBoundary.tsx`.
 *
 * Solid's `ErrorBoundary` accepts `unknown` errors. The wrapper
 * coerces non-`Error` throws into a generic `Error` with the original
 * value's stringified form so consumers always receive an `Error`
 * instance.
 *
 * @group Components
 * @example
 * ```tsx
 * <SchemaErrorBoundary fallback={(error) => <p>{error.message}</p>}>
 *   <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * </SchemaErrorBoundary>
 * ```
 */
export function SchemaErrorBoundary(
    props: SchemaErrorBoundaryProps
): JSX.Element {
    return (
        <ErrorBoundary
            fallback={(err: unknown, reset) => {
                const error =
                    err instanceof Error
                        ? err
                        : new Error(
                              typeof err === "string"
                                  ? err
                                  : "Unknown render error"
                          );
                if (!(error instanceof SchemaError)) {
                    console.error(
                        "[schema-components] Unhandled render error:",
                        error
                    );
                }
                return props.fallback(error, reset);
            }}
        >
            {props.children}
        </ErrorBoundary>
    );
}
