/**
 * Solid headless renderer — the default {@link SolidComponentResolver}
 * implementation.
 *
 * Produces plain HTML elements for every schema type. Theme adapters
 * replace this by implementing `SolidComponentResolver` with their own
 * components.
 *
 * Composes the resolver from individual render functions defined in
 * `solid/renderers.tsx`. Every WalkedField variant the walker can emit
 * has a registered renderer — missing a registration causes
 * `getSolidRenderFunction` to return `undefined` and the field to render
 * as nothing. The resolver shape keeps each key optional so theme
 * adapters can override piecemeal; the registration below is the single
 * source of completeness for the headless path.
 *
 * Accessibility contract mirrors the React adapter — see
 * `react/headless.tsx` for the full list. The same shared helpers
 * (`buildAriaAttrs`, `buildHintInfo`, `idPath`, the union match
 * heuristic) drive both adapters, so the rendered ARIA semantics are
 * identical for the same schema.
 */

import type { SolidComponentResolver } from "./types.ts";
import {
    renderString,
    renderNumber,
    renderBoolean,
    renderNull,
    renderEnum,
    renderObject,
    renderRecord,
    renderArray,
    renderTuple,
    renderUnion,
    renderDiscriminatedUnion,
    renderConditional,
    renderNegation,
    renderLiteral,
    renderFile,
    renderNever,
    renderUnknown,
} from "./renderers.tsx";

/**
 * The Solid headless resolver. Every variant of `WalkedField` is wired
 * here; theme adapters override individual keys to customise the look.
 */
export const headlessSolidResolver: SolidComponentResolver = {
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
