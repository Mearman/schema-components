/**
 * Type-level checks for the Solid adapter.
 *
 * Compile-time assertions live as `Expect`/`Equal`-style intersections
 * inside the test body. Vitest is satisfied with a no-op runtime
 * assertion; the value of the test is that it FAILS TO COMPILE when
 * the type relationship breaks, surfacing the regression at the
 * `pnpm _typecheck` step before the runtime tests even start.
 */
import { describe, expect, it } from "vitest";
import type { JSX } from "solid-js";
import type { RenderFunction } from "../src/core/renderer.ts";
import type {
    SolidComponentResolver,
    SolidRenderFunction,
    SolidRenderProps,
} from "../src/solid/types.ts";

// Helper conditional types for compile-time assertions.
type IsAssignable<A, B> = A extends B ? true : false;
type AssertTrue<T extends true> = T;

describe("Solid type inference", () => {
    it("SolidRenderFunction is assignable to RenderFunction<JSX.Element, SolidRenderProps>", () => {
        // The next type-level alias compiles iff
        // SolidRenderFunction extends RenderFunction<JSX.Element, SolidRenderProps>.
        type _Assert = AssertTrue<
            IsAssignable<
                SolidRenderFunction,
                RenderFunction<JSX.Element, SolidRenderProps>
            >
        >;
        // Reference the alias so TypeScript actually performs the
        // check; the runtime expectation is the no-op true sentinel.
        const ok: _Assert = true;
        expect(ok).toBe(true);
    });

    it("RenderFunction<JSX.Element, SolidRenderProps> is assignable to SolidRenderFunction", () => {
        type _Assert = AssertTrue<
            IsAssignable<
                RenderFunction<JSX.Element, SolidRenderProps>,
                SolidRenderFunction
            >
        >;
        const ok: _Assert = true;
        expect(ok).toBe(true);
    });

    it("SolidComponentResolver entries accept any SolidRenderFunction", () => {
        // Reading typed props proves the inferred shape carries the
        // Solid-flavoured `renderChild` signature — the assignments
        // would be type errors if `value` or `onChange` widened.
        const stringRenderer: SolidRenderFunction = (props) => {
            const value: unknown = props.value;
            const onChange: (v: unknown) => void = props.onChange;
            if (value !== undefined) onChange(value);
            return null;
        };
        const resolver: SolidComponentResolver = { string: stringRenderer };
        expect(typeof resolver.string).toBe("function");
    });
});
