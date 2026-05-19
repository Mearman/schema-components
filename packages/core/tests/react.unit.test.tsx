/**
 * @vitest-environment happy-dom
 *
 * fix-cycle regression tests for SchemaComponent / SchemaView /
 * headlessRenderers.
 *
 * Each `describe` pins one of the regressions documented in the fix
 * brief so a future refactor that re-introduces the bug fails loudly:
 *
 * 1. Codec validation must route through `safeEncode` so output-rendered
 *    values are validated against the codec's reverse direction.
 * 2. `SchemaField.handleChange` must invoke `setNestedValue` exactly once
 *    per change — the previous implementation duplicated the work in
 *    the validate branch.
 * 3. Swagger 2.0 documents must surface as `__SchemaInferenceFellBack`
 *    in both `InferFields` and `InferSchemaValue` (compile-time check).
 * 4. `SchemaView` must accept the same `<T, Ref>` generic signature as
 *    `SchemaComponent` so consumers can hand typed schemas through to
 *    the read-only renderer.
 * 5. `renderDiscriminatedUnion` must narrow on `tree.type ===
 *    "discriminatedUnion"` and emit non-empty `aria-controls` even when
 *    the supplied discriminator value matches no option.
 */
import { describe, it, expect, expectTypeOf, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useState, type ReactElement } from "react";
import { z } from "zod";
import {
    SchemaComponent,
    SchemaField,
    type InferredOutputValue,
    type InferredInputValue,
} from "../src/react/SchemaComponent.tsx";
import { SchemaView } from "../src/react/SchemaView.tsx";
import type { __SchemaInferenceFellBack } from "../src/core/typeInference.ts";
import * as fieldPath from "../src/core/fieldPath.ts";

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// 1. Codec validation — safeEncode against rendered output
// ---------------------------------------------------------------------------

describe("codec validation via safeEncode", () => {
    /**
     * `z.codec(z.string(), z.number(), ...)` — output side is `number`,
     * input side is `string`. The renderer draws the OUTPUT side per
     * `io: "output"`, so the user types a number. Validating that
     * number must succeed; the previous `safeParse` call would have
     * tried to forward-parse a number as a string and failed.
     */
    const stringToNumber = z.codec(z.string(), z.number(), {
        decode: (s) => Number(s),
        encode: (n) => String(n),
    });

    /**
     * The codec schema is rejected at the type level by
     * `RejectUnrepresentableZod` (codecs cannot round-trip through
     * `z.toJSONSchema()`'s `unrepresentable: "throw"` mode in the
     * general case), so the test must reach the runtime path via an
     * `unknown` boundary. This mirrors the runtime contract: the
     * adapter accepts codecs and emits a `zod-codec-output-only`
     * diagnostic, and consumers wrapping a codec in a typed wrapper
     * (`as unknown`) is the documented escape hatch.
     */
    function CodecHarness({
        schema,
        onValidationError,
    }: {
        schema: unknown;
        onValidationError: (e: unknown) => void;
    }): ReactElement {
        const [value, setValue] = useState<unknown>(0);
        // SchemaComponent's schema prop typed as `RejectUnrepresentableZod<T>`
        // — when `T = unknown` the result is `unknown`, so an `unknown`
        // value is structurally accepted here. The compile-time
        // rejection of `z.codec(...)` only fires when T is narrowed
        // to the concrete ZodCodec type, which the harness
        // deliberately avoids so the runtime validation path can be
        // exercised.
        return (
            <SchemaComponent
                schema={schema}
                value={value}
                validate
                onChange={(v) => {
                    setValue(v);
                }}
                onValidationError={onValidationError}
            />
        );
    }

    it("does not surface a validation error for a valid output-side value", () => {
        const onValidationError = vi.fn();

        render(
            <CodecHarness
                schema={stringToNumber}
                onValidationError={onValidationError}
            />
        );

        const input = screen.getByRole("spinbutton");
        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Expected number input");
        }
        fireEvent.change(input, { target: { value: "42" } });

        // safeEncode runs the reverse direction with the number on the
        // output side; the codec accepts it. The previous safeParse
        // call would have forwarded the number through the codec's
        // INPUT side (a string), turning every keystroke into an error.
        expect(onValidationError).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// 2. SchemaField — single setNestedValue per change
// ---------------------------------------------------------------------------

describe("SchemaField.handleChange — single setNestedValue per change", () => {
    /**
     * Spy on the module-level `setNestedValue` export so the count
     * reflects exactly the work the React handler does. Each rendered
     * keystroke must result in exactly one call regardless of whether
     * `validate` is on.
     */
    it("calls setNestedValue exactly once per change when validate is true", () => {
        const schema = z.object({
            user: z.object({
                name: z.string(),
            }),
        });
        const spy = vi.spyOn(fieldPath, "setNestedValue");

        function Controlled(): ReactElement {
            const [value, setValue] = useState<unknown>({
                user: { name: "Ada" },
            });
            return (
                <SchemaField
                    schema={schema}
                    path="user.name"
                    value={value}
                    validate
                    onChange={(next) => {
                        setValue(next);
                    }}
                />
            );
        }

        render(<Controlled />);
        const input = screen.getByDisplayValue("Ada");
        if (!(input instanceof HTMLInputElement)) {
            throw new Error("Expected text input");
        }

        spy.mockClear();
        fireEvent.change(input, { target: { value: "Linus" } });

        // One call per change — the validate branch and the onChange
        // dispatch must share a single computed root value.
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 3. Swagger 2.0 inference falls back, OpenAPI 3.x does not
// ---------------------------------------------------------------------------

describe("Swagger 2.0 inference fallback (compile-time)", () => {
    /**
     * Compile-time assertion: a Swagger 2.0 document literal under
     * `InferredOutputValue` must resolve to `__SchemaInferenceFellBack`
     * (the branded `unique symbol` carrier exported from
     * `core/typeInference.ts`). Two structural type-equality checks pin
     * the contract:
     *
     * - `Expect<Equal<...>>` succeeds when the inferred type and the
     *   brand are mutually assignable; any drift in either direction
     *   makes the file fail to type-check.
     * - The companion check on an OpenAPI 3.1.0 document of the same
     *   shape proves the brand is NOT applied universally — only
     *   Swagger 2.0 takes the fallback branch.
     *
     * No runtime assertions are needed; the file failing to type-check
     * would block the build.
     */
    /** Fixture: the canonical Swagger 2.0 document literal. */
    interface Swagger2Doc {
        readonly swagger: "2.0";
        readonly info: { readonly title: "x"; readonly version: "1" };
        readonly paths: Record<string, never>;
        readonly definitions: {
            readonly User: { readonly type: "object" };
        };
    }

    /** Fixture: the canonical OpenAPI 3.1 document literal. */
    interface Openapi31Doc {
        readonly openapi: "3.1.0";
        readonly info: { readonly title: "x"; readonly version: "1" };
        readonly paths: Record<string, never>;
    }

    it("type-only: Swagger 2.0 surfaces __SchemaInferenceFellBack on InferredOutputValue", () => {
        expectTypeOf<
            InferredOutputValue<Swagger2Doc>
        >().toEqualTypeOf<__SchemaInferenceFellBack>();

        // Sanity check that the same shape under OpenAPI 3.1 does NOT
        // surface the brand. The OpenAPI 3.1 inferred type widens to
        // `unknown` for documents without a ref — distinct from the
        // brand, which is a unique-symbol-carrying interface.
        expectTypeOf<
            InferredOutputValue<Openapi31Doc>
        >().not.toEqualTypeOf<__SchemaInferenceFellBack>();
    });

    it("type-only: Swagger 2.0 fallback applies to InferredInputValue too", () => {
        expectTypeOf<
            InferredInputValue<Swagger2Doc>
        >().toEqualTypeOf<__SchemaInferenceFellBack>();
    });
});

// ---------------------------------------------------------------------------
// 4. SchemaView generic parity with SchemaComponent
// ---------------------------------------------------------------------------

describe("SchemaView typed prop inference parity", () => {
    it("accepts a Zod schema and renders read-only output equivalent to SchemaComponent", () => {
        const schema = z.object({
            name: z.string(),
            email: z.email(),
        });
        const value = { name: "Ada", email: "ada@example.com" };

        const fromView = renderToString(
            <SchemaView schema={schema} value={value} />
        );
        const fromComponent = renderToString(
            <SchemaComponent schema={schema} value={value} readOnly />
        );
        expect(fromView).toBe(fromComponent);
    });

    it("type-only: SchemaView preserves Ref generic when an OpenAPI ref is supplied", () => {
        const openapi = {
            openapi: "3.1.0",
            info: { title: "x", version: "1" },
            paths: {},
            components: {
                schemas: {
                    User: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                        },
                    },
                },
            },
        } as const;

        // The generics flow through — `SchemaView` accepts the typed
        // schema/ref pair just like `SchemaComponent` does. No runtime
        // assertion is required; the file type-checks only when the
        // generic plumbing is intact.
        const element = (
            <SchemaView
                schema={openapi}
                ref="#/components/schemas/User"
                value={{ name: "Ada" }}
            />
        );
        expect(element).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 5. Discriminated union narrowing — aria-controls is never empty
// ---------------------------------------------------------------------------

describe("renderDiscriminatedUnion narrowing", () => {
    const kindSchema = z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), a: z.string() }),
        z.object({ kind: z.literal("b"), b: z.number() }),
    ]);

    it("emits non-empty aria-controls when the discriminator value matches no option", () => {
        // The previous implementation used `discriminator ?? ""` as the
        // tab key, which silently produced empty `aria-controls`
        // attributes when the discriminator key happened to be missing
        // from the value object. The narrow on tree.type guarantees the
        // discriminator is a non-empty string, so aria-controls must
        // resolve to the panel id even when the value's discriminator
        // does not match any option.
        //
        // The fixture seeds an out-of-band discriminator value
        // (`"unmatched"`) to exercise the no-matching-option fallback.
        // The typed `value` prop rejects the literal at compile time
        // (correctly — it is not in the union), so the fixture
        // casts through `unknown` to reach the runtime path.
        const fallbackValue = { kind: "unmatched" } as unknown as {
            kind: "a";
            a: string;
        };
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={fallbackValue} />
        );
        // Every tab has aria-controls pointing at the panel id.
        const ariaControlsValues = [
            ...html.matchAll(/aria-controls="([^"]+)"/g),
        ].map((m) => m[1]);
        expect(ariaControlsValues.length).toBeGreaterThan(0);
        for (const value of ariaControlsValues) {
            expect(value).not.toBe("");
            expect(value).toMatch(/-panel$/);
        }
    });

    it("the tabpanel id matches the aria-controls value emitted by each tab", () => {
        const html = renderToString(
            <SchemaComponent schema={kindSchema} value={{ kind: "a", a: "" }} />
        );
        const ariaControlsValues = [
            ...html.matchAll(/aria-controls="([^"]+)"/g),
        ].map((m) => m[1]);
        const panelIdMatch = /<div role="tabpanel"[^>]*id="([^"]+)"/.exec(html);
        expect(panelIdMatch).not.toBeNull();
        if (panelIdMatch !== null) {
            const panelId = panelIdMatch[1];
            for (const value of ariaControlsValues) {
                expect(value).toBe(panelId);
            }
        }
    });
});
