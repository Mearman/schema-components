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
 * - All inputs have `id`; labels use `htmlFor` for programmatic association
 * - Discriminated union tabs follow WAI-ARIA tabs pattern (role, aria-selected,
 *   arrow key navigation, Home/End)
 * - Checkboxes are linked to visible labels where available
 * - Validation state surfaced via `aria-invalid` and `aria-errormessage`
 */

import type { ComponentResolver } from "../core/renderer.ts";
import {
    renderString,
    renderNumber,
    renderBoolean,
    renderEnum,
    renderObject,
    renderRecord,
    renderArray,
    renderUnion,
    renderDiscriminatedUnion,
    renderFile,
    renderUnknown,
} from "./headlessRenderers.tsx";

// ---------------------------------------------------------------------------
// Exported headless resolver
// ---------------------------------------------------------------------------

/**
 * The headless resolver uses props.renderChild for recursive rendering.
 * No factory function needed — the renderChild is always available
 * on RenderProps.
 */
export const headlessResolver: ComponentResolver = {
    string: renderString,
    number: renderNumber,
    boolean: renderBoolean,
    enum: renderEnum,
    object: renderObject,
    record: renderRecord,
    array: renderArray,
    union: renderUnion,
    discriminatedUnion: renderDiscriminatedUnion,
    file: renderFile,
    unknown: renderUnknown,
};
