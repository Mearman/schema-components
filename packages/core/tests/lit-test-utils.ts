/**
 * Shared helpers for the `unit-lit` test project.
 *
 * Lives under `tests/` (not `src/lit/`) because every helper here
 * exists for test convenience and would otherwise leak Lit-specific
 * upgrade plumbing into production code.
 */

/**
 * Await a Lit element's pending render. The Lit `updateComplete`
 * property is typed `Promise<boolean>`, but reflecting it lazily
 * (the element may have been created in a context where the
 * accessor isn't yet installed) goes through `Reflect.get`, which
 * returns `any`. Type the right-hand side explicitly so the strict
 * `no-unsafe-assignment` rule sees a well-typed boundary, then
 * narrow with `instanceof Promise` before awaiting.
 */
export async function awaitReady(el: Element): Promise<void> {
    // `getProp` is a tiny indirection: the wrapping function's
    // declared return type widens `Reflect.get`'s `any` to `unknown`,
    // satisfying `no-unsafe-assignment` without introducing an `as`
    // cast (banned by the project's lint config).
    const ready = getProp(el, "updateComplete");
    if (ready instanceof Promise) {
        await ready;
    }
}

/**
 * Read a JS property off a DOM element without any `any` leaking
 * into the caller. The Reflect API returns `any`, which trips
 * `no-unsafe-assignment` at the call site; channelling it through a
 * widening helper isolates the boundary.
 */
export function getProp(target: object, key: PropertyKey): unknown {
    return Reflect.get(target, key);
}
