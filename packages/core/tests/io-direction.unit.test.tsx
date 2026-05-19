/**
 * @vitest-environment happy-dom
 *
 * Regression tests for the `io` prop on `<SchemaComponent>` and
 * `<SchemaView>`.
 *
 * The `io` prop selects which side of every transform / pipe / codec
 * the renderer draws. It flows through `normaliseSchema` to
 * `z.toJSONSchema(..., { io })` and is consulted in `runValidation`
 * to pick the matching Zod entry point: `safeEncode` for OUTPUT
 * values (the default — `safeEncode` runs the REVERSE direction),
 * `safeParse` for INPUT values.
 *
 * The tests pin two complementary contracts:
 *
 * 1. `io="input"` renders the INPUT-side JSON Schema. For
 *    `z.codec(z.string(), z.number(), ...)` this is a text input,
 *    where the OUTPUT side rendered a number input.
 * 2. `io="input"` routes validation through `safeParse`. Typing a
 *    string into the input must not surface a validation error.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useState, type ReactElement } from "react";
import { z } from "zod";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";
import { SchemaView } from "../src/react/SchemaView.tsx";
import { IS_PREACT } from "./helpers.ts";

/**
 * `@testing-library/react`'s `fireEvent.change` does not propagate to
 * React-style `onChange` handlers under `preact/compat` aliasing. Tests
 * that rely on a typed-in change firing the codec's validation are skipped
 * under Preact; the same contract is pinned by the `unit` project run.
 */
const itReact = IS_PREACT ? it.skip : it;

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// Shared codec — string input, number output
// ---------------------------------------------------------------------------

/**
 * The canonical asymmetric codec for these tests: typing a string
 * (input side) produces a number (output side) and vice versa.
 * Asymmetry guarantees the `io` prop's effect is observable — a
 * symmetric codec would render the same input element in either
 * direction.
 *
 * The codec is exposed as `unknown` because
 * `RejectUnrepresentableZod<ZodCodec>` returns the compile-time
 * rejection sentinel — codecs cannot round-trip through
 * `z.toJSONSchema()`'s `unrepresentable: "throw"` mode in the
 * general case. Reaching the runtime path requires an `unknown`
 * boundary, mirroring the documented consumer escape hatch for
 * codec validation.
 */
const stringToNumber: unknown = z.codec(z.string(), z.number(), {
    decode: (s) => Number(s),
    encode: (n) => String(n),
});

/**
 * The codec schema is rejected at the type level by
 * `RejectUnrepresentableZod` (codecs cannot round-trip through
 * `z.toJSONSchema()`'s `unrepresentable: "throw"` mode in the
 * general case). Reaching the runtime path requires an `unknown`
 * boundary — the same escape hatch documented for the
 * `safeEncode`-against-output codec test in
 * `round7-react.unit.test.tsx`.
 */
function CodecHarness({
    schema,
    io,
    initialValue,
    onValidationError,
}: {
    schema: unknown;
    io: "input" | "output";
    initialValue: unknown;
    onValidationError?: (e: unknown) => void;
}): ReactElement {
    const [value, setValue] = useState<unknown>(initialValue);

    return (
        <SchemaComponent
            schema={schema}
            io={io}
            value={value}
            validate
            onChange={(v) => {
                setValue(v);
            }}
            {...(onValidationError !== undefined
                ? { onValidationError: onValidationError }
                : {})}
        />
    );
}

// ---------------------------------------------------------------------------
// io rendering — INPUT vs OUTPUT side rendered shape
// ---------------------------------------------------------------------------

describe("SchemaComponent — io prop selects the rendered side of a codec", () => {
    it("io='input' renders a text input for the codec's input shape", () => {
        const html = renderToString(
            <SchemaComponent schema={stringToNumber} io="input" value="" />
        );
        // INPUT side is `z.string()` — the headless renderer emits a
        // text input.
        expect(html).toContain('type="text"');
        expect(html).not.toContain('type="number"');
    });

    it("io='output' (default) renders a number input for the codec's output shape", () => {
        const html = renderToString(
            <SchemaComponent schema={stringToNumber} value={0} />
        );
        // OUTPUT side is `z.number()` — the headless renderer emits a
        // number input.
        expect(html).toContain('type="number"');
        expect(html).not.toContain('type="text"');
    });

    it("io='output' rendered explicitly matches the default rendering", () => {
        const htmlDefault = renderToString(
            <SchemaComponent schema={stringToNumber} value={0} />
        );
        const htmlExplicit = renderToString(
            <SchemaComponent schema={stringToNumber} io="output" value={0} />
        );
        expect(htmlExplicit).toBe(htmlDefault);
    });
});

describe("SchemaView — io prop selects the rendered side of a codec", () => {
    it("io='input' renders the codec's input side in read-only mode", () => {
        const html = renderToString(
            <SchemaView schema={stringToNumber} io="input" value="hello" />
        );
        // String input side, read-only — the value is rendered as
        // text content (or a span with the value), no number-typed
        // input element.
        expect(html).toContain("hello");
        expect(html).not.toContain('type="number"');
    });

    it("io='output' (default) renders the codec's output side in read-only mode", () => {
        const html = renderToString(
            <SchemaView schema={stringToNumber} value={42} />
        );
        // Number output side renders the numeric value.
        expect(html).toContain("42");
    });
});

// ---------------------------------------------------------------------------
// io validation — direction selects safeParse vs safeEncode
// ---------------------------------------------------------------------------

describe("SchemaComponent — io='input' routes validation through safeParse", () => {
    it("typing a valid input-side string does not surface a validation error", () => {
        const onValidationError = vi.fn();

        render(
            <CodecHarness
                schema={stringToNumber}
                io="input"
                initialValue=""
                onValidationError={onValidationError}
            />
        );

        const input = screen.getByRole("textbox");
        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Expected text input");
        }
        // Type a numeric string so the codec's `decode` step
        // (`Number(s)`) produces a valid number. The codec then
        // validates the decoded number against the output schema —
        // safeParse runs the FORWARD direction and reaches both
        // halves of the pipe.
        fireEvent.change(input, { target: { value: "42" } });

        // safeParse runs the forward direction with the string on
        // the input side; the codec accepts it. The wrong entry
        // point (`safeEncode`) would have fed the string into the
        // codec's OUTPUT side (a number), failing on every keystroke.
        expect(onValidationError).not.toHaveBeenCalled();
    });

    itReact(
        "typing an input-side string that fails to decode surfaces the validation error",
        () => {
            // Asymmetric codecs whose `decode` returns NaN should still
            // surface a validation error — the input side runs through
            // the FORWARD direction (`safeParse`), and the output
            // schema (`z.number()`) rejects NaN. This pins the contract
            // that validation actually fires; the previous case proves
            // it does not over-fire on valid input.
            const onValidationError = vi.fn();

            render(
                <CodecHarness
                    schema={stringToNumber}
                    io="input"
                    initialValue=""
                    onValidationError={onValidationError}
                />
            );

            const input = screen.getByRole("textbox");
            if (!(input instanceof HTMLInputElement)) {
                throw new Error("Expected text input");
            }
            fireEvent.change(input, { target: { value: "not-a-number" } });

            expect(onValidationError).toHaveBeenCalledTimes(1);
        }
    );
});

describe("SchemaComponent — io='output' (default) routes validation through safeEncode", () => {
    it("typing a valid output-side number does not surface a validation error", () => {
        // Pinned by the existing `codec validation via safeEncode`
        // test in `round7-react.unit.test.tsx` — duplicated here in
        // the `io='output'` arm so the contract is verifiable as a
        // mirror of the new `io='input'` test above. Both arms must
        // remain green for the `io` prop to be considered wired
        // through end-to-end.
        const onValidationError = vi.fn();

        render(
            <CodecHarness
                schema={stringToNumber}
                io="output"
                initialValue={0}
                onValidationError={onValidationError}
            />
        );

        const input = screen.getByRole("spinbutton");
        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Expected number input");
        }
        fireEvent.change(input, { target: { value: "42" } });

        expect(onValidationError).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// io interaction with the schema cache
// ---------------------------------------------------------------------------

describe("SchemaComponent — io prop bypasses the normalisation cache", () => {
    it("re-rendering with a different io value produces a different rendered shape for the same schema instance", () => {
        // The adapter caches normalised schemas by object identity.
        // Without an io-aware cache key, the second render below
        // would silently re-use the OUTPUT-side cached entry and
        // emit a number input instead of the INPUT-side text input.
        const htmlOutput = renderToString(
            <SchemaComponent schema={stringToNumber} io="output" value={0} />
        );
        const htmlInput = renderToString(
            <SchemaComponent schema={stringToNumber} io="input" value="" />
        );

        expect(htmlOutput).toContain('type="number"');
        expect(htmlInput).toContain('type="text"');
        expect(htmlOutput).not.toBe(htmlInput);
    });
});
