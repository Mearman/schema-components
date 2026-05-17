/**
 * @vitest-environment happy-dom
 *
 * Tests for the SchemaComponent validation fallback contract when
 * `z.fromJSONSchema` cannot round-trip the already-normalised JSON Schema.
 *
 * The contract:
 * - `validate=true`, schema valid: no error, no diagnostic.
 * - `validate=true`, schema unrepresentable, `onDiagnostic` wired:
 *   diagnostic fires, no error.
 * - `validate=true`, schema unrepresentable, no `onDiagnostic`, `onError`
 *   wired: error fires there.
 * - `validate=true`, schema unrepresentable, no `onDiagnostic`, no `onError`:
 *   error escapes the event handler.
 *
 * The unrepresentable JSON Schema used here is a `dependentSchemas` map —
 * the schema-components walker handles it natively, but `z.fromJSONSchema`
 * throws "dependentSchemas and dependentRequired are not supported", which
 * exercises the fallback path on every change event.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { SchemaError, SchemaNormalisationError } from "../src/core/errors.ts";
import type { Diagnostic } from "../src/core/diagnostics.ts";

function noop() {
    /* intentional no-op */
}

// Unrepresentable: `dependentSchemas` is not supported by z.fromJSONSchema
// but the schema-components walker renders it normally.
const unrepresentableJsonSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
    },
    dependentSchemas: {
        name: { required: ["email"] as const },
    },
};

// A plain, fully-representable JSON Schema used for the happy-path test.
const representableJsonSchema = {
    type: "object" as const,
    properties: {
        name: { type: "string" as const },
    },
};

describe("validation fallback — no diagnostic sink and no onError", () => {
    afterEach(() => {
        cleanup();
    });

    /**
     * React 18+ catches errors thrown from event handlers and reports
     * them via `reportError()` rather than letting them propagate out of
     * `dispatchEvent`. In happy-dom this surfaces as a `window` `error`
     * event, which test code can capture by attaching a listener.
     *
     * The failure must be observable somewhere — the project's
     * no-silent-fallback rule forbids quietly skipping validation when
     * the fallback cannot run. With no diagnostic sink and no `onError`
     * prop, the only place left is the host's uncaught-error channel.
     */
    it("reports a SchemaNormalisationError via the host error channel", () => {
        const errors: unknown[] = [];
        const handler = (ev: ErrorEvent): void => {
            errors.push(ev.error);
            ev.preventDefault();
        };
        window.addEventListener("error", handler);
        try {
            render(
                createElement(SchemaComponent, {
                    schema: unrepresentableJsonSchema,
                    value: { name: "Ada" },
                    validate: true,
                    onChange: noop,
                })
            );

            const input = screen.getByDisplayValue("Ada");
            fireEvent.change(input, { target: { value: "Lovelace" } });
        } finally {
            window.removeEventListener("error", handler);
        }

        const reported = errors.find(
            (e): e is SchemaNormalisationError =>
                e instanceof SchemaNormalisationError
        );
        expect(reported).toBeDefined();
        if (reported === undefined) return;
        expect(reported).toBeInstanceOf(SchemaError);
        expect(reported.kind).toBe("zod-conversion-failed");
        // The schema attached to the error is the normalised JSON Schema
        // that tripped the fallback (deep-equal to the input — the
        // adapter clones it during normalisation).
        expect(reported.schema).toEqual(unrepresentableJsonSchema);
        // The underlying cause from z.fromJSONSchema is preserved on the
        // native Error.cause property so consumers can introspect the
        // Zod-side message.
        expect(reported.cause).toBeDefined();
        expect(reported.message).toMatch(/z\.fromJSONSchema/);
    });
});

describe("validation fallback — onError wired, no diagnostic sink", () => {
    afterEach(() => {
        cleanup();
    });

    it("routes the failure through onError instead of throwing", () => {
        const onError = vi.fn();

        render(
            createElement(SchemaComponent, {
                schema: unrepresentableJsonSchema,
                value: { name: "Ada" },
                validate: true,
                onChange: noop,
                onError,
            })
        );

        const input = screen.getByDisplayValue("Ada");
        expect(() => {
            fireEvent.change(input, { target: { value: "Lovelace" } });
        }).not.toThrow();

        expect(onError).toHaveBeenCalledTimes(1);
        const arg: unknown = onError.mock.calls[0]?.[0];
        expect(arg).toBeInstanceOf(SchemaNormalisationError);
        if (arg instanceof SchemaNormalisationError) {
            expect(arg.kind).toBe("zod-conversion-failed");
        }
    });
});

describe("validation fallback — diagnostic sink wired", () => {
    afterEach(() => {
        cleanup();
    });

    it("emits a diagnostic and does not throw or call onError", () => {
        const diagnostics: Diagnostic[] = [];
        const onError = vi.fn();
        const onValidationError = vi.fn();

        render(
            createElement(SchemaComponent, {
                schema: unrepresentableJsonSchema,
                value: { name: "Ada" },
                validate: true,
                onChange: noop,
                onDiagnostic: (d) => diagnostics.push(d),
                onError,
                onValidationError,
            })
        );

        const input = screen.getByDisplayValue("Ada");
        expect(() => {
            fireEvent.change(input, { target: { value: "Lovelace" } });
        }).not.toThrow();

        const diag = diagnostics.find(
            (d) =>
                d.code === "unsupported-type" &&
                d.detail?.source === "z.fromJSONSchema"
        );
        expect(diag).toBeDefined();
        expect(onError).not.toHaveBeenCalled();
        expect(onValidationError).not.toHaveBeenCalled();
    });
});

describe("validation fallback — representable schema", () => {
    afterEach(() => {
        cleanup();
    });

    it("does not throw, emit a diagnostic, or call onError when the schema validates cleanly", () => {
        const diagnostics: Diagnostic[] = [];
        const onError = vi.fn();
        const onValidationError = vi.fn();

        render(
            createElement(SchemaComponent, {
                schema: representableJsonSchema,
                value: { name: "Ada" },
                validate: true,
                onChange: noop,
                onDiagnostic: (d) => diagnostics.push(d),
                onError,
                onValidationError,
            })
        );

        const input = screen.getByDisplayValue("Ada");
        expect(() => {
            fireEvent.change(input, { target: { value: "Lovelace" } });
        }).not.toThrow();

        // No fallback diagnostic — the JSON Schema round-trips through Zod
        // without complaint.
        const diag = diagnostics.find(
            (d) =>
                d.code === "unsupported-type" &&
                d.detail?.source === "z.fromJSONSchema"
        );
        expect(diag).toBeUndefined();
        expect(onError).not.toHaveBeenCalled();
        // The string accepted by the schema; no validation error fires.
        expect(onValidationError).not.toHaveBeenCalled();
    });

    it("does not throw or call onError for a Zod schema that validates cleanly", () => {
        const zodSchema = z.object({ name: z.string() });
        const onError = vi.fn();
        const onValidationError = vi.fn();
        const diagnostics: Diagnostic[] = [];

        render(
            createElement(SchemaComponent, {
                schema: zodSchema,
                value: { name: "Ada" },
                validate: true,
                onChange: noop,
                onError,
                onValidationError,
                onDiagnostic: (d) => diagnostics.push(d),
            })
        );

        const input = screen.getByDisplayValue("Ada");
        expect(() => {
            fireEvent.change(input, { target: { value: "Lovelace" } });
        }).not.toThrow();

        expect(onError).not.toHaveBeenCalled();
        expect(onValidationError).not.toHaveBeenCalled();
        expect(
            diagnostics.some(
                (d) =>
                    d.code === "unsupported-type" &&
                    d.detail?.source === "z.fromJSONSchema"
            )
        ).toBe(false);
    });
});
