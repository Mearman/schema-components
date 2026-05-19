/**
 * Tiny structural-type helpers for the Lit adapter.
 *
 * Lives alongside `lit/registry.ts` rather than under `core/` because
 * the Custom-Element constructor signature is only needed by the Lit
 * surface — other adapter directories model their renderers as plain
 * functions and have no use for it.
 *
 * @packageDocumentation
 */

/**
 * Generic newable constructor type compatible with the DOM's
 * `CustomElementConstructor`. Used by {@link BUILT_IN_ELEMENTS} (the
 * canonical-tag → element-constructor map) so the map's value type
 * carries enough structure for `customElements.define` to accept it
 * without an `as` cast.
 *
 * Matches the DOM type-library signature
 * `interface CustomElementConstructor { new (...params: any[]): HTMLElement; }`
 * but parameterised over a `T extends HTMLElement` so it can also be
 * used in narrower contexts.
 *
 * `unknown[]` is used in the parameter list — the DOM lib uses
 * `any[]`, but `unknown[]` is the strict-mode equivalent that
 * accepts any positional argument shape without using `any`.
 */
export type Constructor<T extends HTMLElement> = new (
    ...params: unknown[]
) => T;
