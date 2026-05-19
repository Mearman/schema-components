/**
 * Narrowing helpers for DOM event targets used by the Vue renderers.
 *
 * Vue's DOM event handlers receive `Event` whose `target` is typed
 * `EventTarget | null`. The renderers need the concrete `HTMLInputElement`
 * / `HTMLSelectElement` to read `value`, `checked`, or `files`. Plain
 * `event.target as HTMLInputElement` is banned by the project lint
 * rules (`@typescript-eslint/consistent-type-assertions`), so the
 * narrowing happens here through `instanceof` checks.
 *
 * Returning `undefined` when the target is not the expected element
 * type lets each caller decide whether to skip the value-extraction
 * step or treat it as a no-op — both branches are documented at the
 * call site rather than masked behind a sentinel default.
 */

/**
 * Narrow an event to its `HTMLInputElement` target, or `undefined`
 * when the event was fired on a different element type.
 */
export function inputTarget(event: Event): HTMLInputElement | undefined {
    const target = event.target;
    if (target instanceof HTMLInputElement) return target;
    return undefined;
}

/**
 * Narrow an event to its `HTMLSelectElement` target, or `undefined`
 * when the event was fired on a different element type.
 */
export function selectTarget(event: Event): HTMLSelectElement | undefined {
    const target = event.target;
    if (target instanceof HTMLSelectElement) return target;
    return undefined;
}
