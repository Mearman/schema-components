/**
 * React headless renderer — the default ComponentResolver implementation.
 *
 * Produces plain HTML elements for every schema type. Theme adapters
 * replace this by implementing ComponentResolver with their own components.
 *
 * This module composes the resolver from individual render
 * functions defined in `headlessRenderers.tsx`.
 *
 * Accessibility:
 * - All inputs have `id`; labels use `htmlFor` for programmatic association.
 * - Object fields fall back to the structural key as label text when no
 *   `description` is supplied.
 * - Discriminated union tabs follow WAI-ARIA tabs pattern (role,
 *   aria-selected on every tab, aria-orientation, arrow key navigation,
 *   Home/End).
 * - Constraint hints emit a sibling `<small class="sc-hint">` referenced
 *   from the input via `aria-describedby`.
 * - Checkboxes are linked to visible labels where available.
 *
 * Known gap: per-field validation errors are dispatched through the
 * `onValidationError` field override callbacks but are NOT yet surfaced
 * to inputs as `aria-invalid="true"` / `aria-errormessage`. Wiring that
 * requires plumbing error state through `RenderProps`, deciding the
 * trigger semantics (per-keystroke vs. blur), and adding inline
 * error-message containers — left for a dedicated change rather than
 * shipping a partial implementation here.
 */

import type { ComponentResolver } from "../core/renderer.ts";
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
} from "./headlessRenderers.tsx";

// ---------------------------------------------------------------------------
// Exported headless resolver
// ---------------------------------------------------------------------------

/**
 * The headless resolver uses props.renderChild for recursive rendering.
 * No factory function needed — the renderChild is always available
 * on RenderProps.
 *
 * Every WalkedField variant the walker can emit has a registered renderer.
 * Missing a registration causes `getRenderFunction` to return `undefined`
 * and the field to render as nothing — silent invisibility. The
 * `ComponentResolver` interface keeps each key optional for theme
 * adapters, so the registration here is the single source of completeness.
 */
export const headlessResolver: ComponentResolver = {
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
