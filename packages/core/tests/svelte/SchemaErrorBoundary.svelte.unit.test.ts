/**
 * Unit tests for `<SchemaErrorBoundary>` — verifies that the
 * Svelte 5 `<svelte:boundary>` primitive catches synchronous render
 * errors thrown by a descendant component and routes them through
 * the supplied `failed` snippet.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import ErrorBoundaryHarness from "./fixtures/ErrorBoundaryHarness.svelte";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("<SchemaErrorBoundary>", () => {
    it("catches a synchronous render error and renders the failed snippet", () => {
        // Suppress the boundary's diagnostic console.error so the
        // test output stays clean; the assertion below covers the
        // user-visible behaviour.
        const spy = vi.spyOn(console, "error").mockImplementation(() => {
            /* swallow */
        });

        const { getByTestId } = render(ErrorBoundaryHarness, {
            props: { throwMessage: "the dispatcher exploded" },
        });

        const fallback = getByTestId("boundary-fallback");
        expect(fallback.textContent).toBe("the dispatcher exploded");

        // The boundary's logIfUnexpected hook calls console.error for
        // non-`SchemaError` throws. Our fixture throws a plain `Error`
        // so we expect at least one call.
        expect(spy).toHaveBeenCalled();
    });
});
