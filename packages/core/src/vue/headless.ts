/**
 * Vue headless renderer — the default {@link VueComponentResolver}
 * implementation.
 *
 * Produces plain Vue {@link VNode}s for every schema field type. Theme
 * adapters replace this by implementing {@link VueComponentResolver}
 * with their own components.
 *
 * Composes the resolver from the individual render functions in
 * `vue/renderers.ts`. Every {@link WalkedField} variant the walker can
 * emit has a registered renderer — missing a registration causes
 * {@link getVueRenderFunction} to return `undefined` and the field to
 * render as nothing.
 */

import type { VueComponentResolver } from "./types.ts";
import {
    renderArray,
    renderBoolean,
    renderConditional,
    renderDiscriminatedUnion,
    renderEnum,
    renderFile,
    renderLiteral,
    renderNegation,
    renderNever,
    renderNull,
    renderNumber,
    renderObject,
    renderRecord,
    renderString,
    renderTuple,
    renderUnion,
    renderUnknown,
} from "./renderers.ts";

/**
 * The Vue headless resolver. Maps every {@link WalkedField} variant to
 * its default render function. Mirrors `react/headless.tsx`'s
 * `headlessResolver` so consumers can switch between adapters without
 * losing field coverage.
 */
export const headlessVueResolver: VueComponentResolver = {
    string: renderString,
    number: renderNumber,
    boolean: renderBoolean,
    null: renderNull,
    enum: renderEnum,
    object: renderObject,
    record: renderRecord,
    array: renderArray,
    tuple: renderTuple,
    union: renderUnion,
    discriminatedUnion: renderDiscriminatedUnion,
    conditional: renderConditional,
    negation: renderNegation,
    literal: renderLiteral,
    file: renderFile,
    never: renderNever,
    unknown: renderUnknown,
};
