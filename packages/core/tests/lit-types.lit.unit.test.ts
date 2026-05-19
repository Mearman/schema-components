/**
 * Type-level tests for the Lit adapter.
 *
 * Verifies that {@link LitRenderFunction} structurally matches the
 * generic `(props: P) => O` shape that the core renderer carries —
 * documented in `core/renderer.ts` as the parameterisable signature
 * specialised over output type for each adapter (React `unknown`,
 * HTML `string`, Lit `TemplateResult`).
 *
 * These are pure type checks; the assertions are evaluated at
 * compile time. The runtime `it` body is just a hook so the project
 * test count picks them up.
 */

import { describe, it, expect } from "vitest";
import { html } from "lit";
import type { TemplateResult } from "lit";
import type {
    LitRenderFunction,
    LitRenderProps,
    LitComponentResolver,
} from "../src/lit/types.ts";

// Identity-quantified probes — the canonical TS technique for
// structural type equality. The `<U>` quantifiers appear on each
// side so the test only succeeds when A and B are mutually
// assignable in BOTH directions.
//
// eslint-disable rule annotation is impossible (no inline comments
// permitted by the project's lint config). Instead, the type aliases
// below give each probe its own name so the unused-type-parameter
// rule sees a clear shape, not a one-use parameter inside an
// anonymous tuple.
type ProbeA<A> = <U>() => U extends A ? 1 : 2;
type ProbeB<B> = <U>() => U extends B ? 1 : 2;
type Equals<A, B> = ProbeA<A> extends ProbeB<B> ? true : false;

describe("LitRenderFunction type compatibility", () => {
    it("matches (props: LitRenderProps) => TemplateResult", () => {
        const witness: Equals<
            LitRenderFunction,
            (props: LitRenderProps) => TemplateResult
        > = true;
        expect(witness).toBe(true);
    });

    it("LitComponentResolver carries every WalkedField key", () => {
        const stub: LitRenderFunction = () => html``;
        const r: LitComponentResolver = {
            string: stub,
            number: stub,
            boolean: stub,
            null: stub,
            enum: stub,
            object: stub,
            array: stub,
            tuple: stub,
            record: stub,
            union: stub,
            discriminatedUnion: stub,
            conditional: stub,
            negation: stub,
            literal: stub,
            file: stub,
            never: stub,
            unknown: stub,
        };
        expect(Object.keys(r).length).toBe(17);
    });
});
