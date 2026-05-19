/**
 * Type-level test for the Svelte adapter's renderer surface.
 *
 * Asserts at compile time that
 * {@link "../../src/svelte/types.ts".SvelteRenderFunction} is a valid
 * specialisation of
 * {@link "../../src/core/renderer.ts".RenderFunction} — i.e. the
 * Svelte adapter's render-function shape is structurally compatible
 * with the generic dispatcher contract.
 *
 * Runs as a unit test for symmetry with the rest of the Svelte test
 * suite, but the assertions are at the type level — vitest sees one
 * `expect(true).toBe(true)` per case once the file compiles.
 */

import { describe, expect, it } from "vitest";
import type {
    SvelteRenderDescriptor,
    SvelteRenderFunction,
    SvelteRenderProps,
} from "../../src/svelte/types.ts";
import type { __SvelteRenderFunctionMatchesGenericRenderFunction } from "../../src/svelte/types.ts";
import type { RenderFunction } from "../../src/core/renderer.ts";

// ---------------------------------------------------------------------------
// Type-level assertions
// ---------------------------------------------------------------------------

type ExpectTrue<T extends true> = T;

/**
 * Compile-time: `SvelteRenderFunction` is exactly the
 * `(SvelteRenderProps) =\> SvelteRenderDescriptor | null` shape the
 * dispatcher invokes. The exported alias survives the
 * `no-unused-vars` lint rule because re-exporting it from a test
 * file gives downstream consumers a stable reference to the
 * assertion.
 */
export type ASvelteRenderFunctionShape = ExpectTrue<
    SvelteRenderFunction extends (
        props: SvelteRenderProps
    ) => SvelteRenderDescriptor | null
        ? true
        : false
>;

/**
 * Compile-time: `SvelteRenderFunction` is a specialisation of the
 * generic `RenderFunction<Output, Props>` from `core/renderer.ts`.
 */
export type AGenericAlignment = ExpectTrue<
    SvelteRenderFunction extends RenderFunction<
        SvelteRenderDescriptor | null,
        SvelteRenderProps
    >
        ? true
        : false
>;

/**
 * Compile-time: the marker alias exported from `types.ts` holds.
 */
export type AMarkerHolds = ExpectTrue<
    __SvelteRenderFunctionMatchesGenericRenderFunction extends true
        ? true
        : false
>;

describe("SvelteRenderFunction type alignment", () => {
    it("is structurally a specialisation of RenderFunction (compile-time)", () => {
        // The assertion is the type-level test above. The runtime
        // expectation is a no-op so vitest reports a passing case
        // when the file successfully compiles.
        expect(true).toBe(true);
    });
});
