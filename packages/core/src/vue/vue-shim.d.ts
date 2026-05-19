/**
 * Ambient module declaration for `.vue` Single-File Component imports.
 *
 * TypeScript cannot natively parse `.vue` files, so we shim every
 * `*.vue` import as a `DefineComponent`. Vue's official tooling
 * (`vue-tsc`, Volar in editor mode) reads the actual SFC and produces
 * a fully-typed component definition; this shim provides a sound
 * fallback for plain `tsc --noEmit` so the existing typecheck step
 * (`packages/core/_typecheck`) continues to pass without depending on
 * `vue-tsc` being added to the toolchain.
 *
 * The catch-all generics deliberately accept any prop shape — Vitest's
 * `mount()` and the consuming SFCs supply concrete props at the call
 * site, and the runtime Vue compiler validates them.
 */

declare module "*.vue" {
    import type { DefineComponent } from "vue";
    const component: DefineComponent<
        Record<string, unknown>,
        Record<string, unknown>,
        unknown
    >;
    export default component;
}
