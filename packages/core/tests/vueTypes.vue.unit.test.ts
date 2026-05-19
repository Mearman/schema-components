/**
 * Type-inference tests for the Vue adapter.
 *
 * Verifies that `VueRenderFunction` composes with the generic
 * `RenderFunction<Output, Props>` from `core/renderer.ts` and that
 * the Vue resolver's per-key entries match the generic dispatcher's
 * `lookupRenderFn` signature.
 */

import { describe, expectTypeOf, it } from "vitest";
import { h, type VNode } from "vue";
import type { RenderFunction } from "../src/core/renderer.ts";
import type {
    VueComponentResolver,
    VueRenderFunction,
    VueRenderProps,
} from "../src/vue/types.ts";
import { getVueRenderFunction } from "../src/vue/resolver.ts";

describe("Vue type-inference contracts", () => {
    it("VueRenderFunction equals RenderFunction<VNode, VueRenderProps>", () => {
        // `expectTypeOf<A>().toEqualTypeOf<B>()` succeeds iff A and B
        // are mutually assignable — the strongest contract we can
        // express. If a future refactor accidentally splits the two
        // shapes (e.g. by adding a required field to one side but
        // not the other), this assertion fails at compile time.
        expectTypeOf<VueRenderFunction>().toEqualTypeOf<
            RenderFunction<VNode, VueRenderProps>
        >();
    });

    it("getVueRenderFunction returns VueRenderFunction | undefined", () => {
        const resolver: VueComponentResolver = {};
        const lookup = getVueRenderFunction("string", resolver);
        expectTypeOf(lookup).toEqualTypeOf<VueRenderFunction | undefined>();
    });

    it("VueRenderProps.renderChild signature matches the generic baseline", () => {
        type RenderChild = VueRenderProps["renderChild"];
        // Four-argument signature, returns VNode.
        expectTypeOf<RenderChild>().toEqualTypeOf<
            (
                tree: import("../src/core/types.ts").WalkedField,
                value: unknown,
                onChange: (v: unknown) => void,
                pathSuffix?: string
            ) => VNode
        >();
    });

    it("VueRenderFunction return type is VNode (not ReactNode)", () => {
        const r: VueRenderFunction = () => h("span");
        const result = r({} as VueRenderProps);
        expectTypeOf(result).toEqualTypeOf<VNode>();
    });
});
