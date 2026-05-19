/**
 * Custom Element registration for the Lit / Web Components adapter.
 *
 * The built-in `<sc-*>` elements are NOT registered as a side-effect
 * of importing `lit/registry.ts` — consumers MUST call
 * {@link registerSchemaComponents} explicitly. This is the
 * established pattern for libraries that ship Custom Elements
 * (Shoelace, Spectrum, Carbon) and is important for two reasons:
 *
 * 1. **Side-effect-free imports.** Tree-shaking removes elements the
 *    consumer doesn't use, and the import order doesn't matter — the
 *    library never silently calls `customElements.define` on the
 *    consumer's behalf.
 * 2. **Tag prefix collisions.** Without prefix support, two libraries
 *    that ship `<sc-string>` would crash on the second
 *    `customElements.define` call (the browser throws a
 *    `DOMException` for re-registration). Passing a prefix lets the
 *    consumer namespace the elements out of conflict.
 *
 * @packageDocumentation
 */

import type { Constructor } from "./constructorTypes.ts";
import { SchemaComponent } from "./SchemaComponent.ts";
import { SchemaView } from "./SchemaView.ts";
import { SchemaField } from "./SchemaField.ts";
import { ScString } from "./renderers/scString.ts";
import { ScNumber } from "./renderers/scNumber.ts";
import { ScBoolean } from "./renderers/scBoolean.ts";
import { ScEnum } from "./renderers/scEnum.ts";
import { ScObject } from "./renderers/scObject.ts";
import { ScArray } from "./renderers/scArray.ts";
import { ScTuple } from "./renderers/scTuple.ts";
import { ScRecord } from "./renderers/scRecord.ts";
import { ScUnion } from "./renderers/scUnion.ts";
import { ScDiscriminated } from "./renderers/scDiscriminated.ts";
import { ScFile } from "./renderers/scFile.ts";
import { ScUnknown } from "./renderers/scUnknown.ts";
import { ScLiteral, ScNull, ScNever } from "./renderers/scLiteralNullNever.ts";
import { ScConditional, ScNegation } from "./renderers/scConditional.ts";

/**
 * Mapping from the canonical built-in tag (without prefix) to the
 * `BaseScElement` subclass that backs it. Exported so consumers can
 * introspect what {@link registerSchemaComponents} will register —
 * useful for diagnostics and for building documentation surfaces.
 *
 * The top-level orchestrator elements (`schema-component`,
 * `schema-view`, `schema-field`) are listed alongside the per-type
 * `<sc-*>` elements; the structural type relaxes to `HTMLElement` so
 * every constructor is assignable.
 */
export const BUILT_IN_ELEMENTS: Readonly<
    Record<string, Constructor<HTMLElement>>
> = Object.freeze({
    "schema-component": SchemaComponent,
    "schema-view": SchemaView,
    "schema-field": SchemaField,
    "sc-string": ScString,
    "sc-number": ScNumber,
    "sc-boolean": ScBoolean,
    "sc-enum": ScEnum,
    "sc-object": ScObject,
    "sc-array": ScArray,
    "sc-tuple": ScTuple,
    "sc-record": ScRecord,
    "sc-union": ScUnion,
    "sc-discriminated": ScDiscriminated,
    "sc-conditional": ScConditional,
    "sc-negation": ScNegation,
    "sc-literal": ScLiteral,
    "sc-null": ScNull,
    "sc-never": ScNever,
    "sc-file": ScFile,
    "sc-unknown": ScUnknown,
});

/**
 * Register every built-in `<sc-*>` Custom Element on the global
 * `customElements` registry, optionally namespaced under `prefix`.
 *
 * Re-registering the same tag is a no-op — `customElements.get(tag)`
 * is checked first so calling this function twice (or alongside
 * another library that registered the same tag) does not throw.
 *
 * @param prefix - Optional prefix prepended to every built-in tag.
 *   E.g. `registerSchemaComponents("myapp-")` registers
 *   `<myapp-sc-string>`, `<myapp-sc-number>`, …, avoiding collisions
 *   with another library that may have shipped its own `<sc-*>`
 *   elements. Pass an empty string (the default) to use the
 *   canonical names.
 * @returns A {@link RegistrationResult} carrying the canonical-tag →
 *   registered-tag map and the list of elements skipped because the
 *   tag was already registered. The map is used by the default
 *   resolver to look up the right tag when the consumer chose a
 *   custom prefix.
 *
 * @example
 * ```ts
 * // Default registration — tags are <sc-string>, <sc-number>, ...
 * import { registerSchemaComponents } from "schema-components/lit/registry";
 * const tags = registerSchemaComponents();
 *
 * // Namespaced registration — tags are <myapp-sc-string>, ...
 * const namespaced = registerSchemaComponents("myapp-");
 * ```
 */
export function registerSchemaComponents(prefix = ""): RegistrationResult {
    const registered: Record<string, string> = {};
    const skipped: string[] = [];
    for (const [canonical, ctor] of Object.entries(BUILT_IN_ELEMENTS)) {
        const tag = `${prefix}${canonical}`;
        if (customElements.get(tag) !== undefined) {
            registered[canonical] = tag;
            skipped.push(tag);
            continue;
        }
        customElements.define(tag, ctor);
        registered[canonical] = tag;
    }
    return { tags: registered, skipped };
}

/**
 * Return value of {@link registerSchemaComponents}.
 *
 * The `tags` map carries the canonical-tag → registered-tag mapping
 * for every built-in element. The default Lit resolver reads this map
 * to dispatch from a `WalkedField.type` to the matching Custom
 * Element tag — see `lit/renderers/defaultResolver.ts`.
 *
 * The `skipped` array lists tags that were already registered (a
 * second call to `registerSchemaComponents` with the same prefix, or
 * a deliberate consumer-side registration that pre-empted the
 * default). Skipped tags are NOT re-registered — the consumer's
 * implementation wins.
 */
export interface RegistrationResult {
    tags: Readonly<Record<string, string>>;
    skipped: readonly string[];
}
