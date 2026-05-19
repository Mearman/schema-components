/** @jsxImportSource solid-js */
/**
 * Verifies the Solid `<SchemaErrorBoundary>` catches throws raised by a
 * descendant renderer and routes them through the consumer-supplied
 * `fallback` callback. Mirrors `react/SchemaErrorBoundary` semantics.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { SchemaErrorBoundary } from "../src/solid/SchemaErrorBoundary.tsx";

afterEach(() => {
    cleanup();
});

describe("Solid <SchemaErrorBoundary>", () => {
    it("renders the fallback when a child throws synchronously", () => {
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {
                /* swallow expected log */
            });

        const Boom = () => {
            throw new Error("boom");
        };

        const { container } = render(() => (
            <SchemaErrorBoundary
                fallback={(error) => <p data-testid="fb">{error.message}</p>}
            >
                <Boom />
            </SchemaErrorBoundary>
        ));

        const fallback = container.querySelector('p[data-testid="fb"]');
        expect(fallback?.textContent).toBe("boom");
        // Non-SchemaError throws should hit console.error — verifies the
        // structured-error branch routes silently while unknown ones do
        // not.
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
    });

    it("renders children unchanged when nothing throws", () => {
        const { container } = render(() => (
            <SchemaErrorBoundary
                fallback={(error) => <p data-testid="fb">{error.message}</p>}
            >
                <p data-testid="child">ok</p>
            </SchemaErrorBoundary>
        ));

        const child = container.querySelector('p[data-testid="child"]');
        expect(child?.textContent).toBe("ok");
        const fallback = container.querySelector('p[data-testid="fb"]');
        expect(fallback).toBeNull();
    });
});
