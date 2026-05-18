/**
 * Shared CSS class names and visual placeholders used by every render
 * pipeline (React, HTML-sync, HTML-stream). Centralising avoids drift
 * between renderers and the bundled default stylesheet (`styles.css`).
 *
 * Class names are intentionally namespaced under `sc-` so consumer themes
 * can pattern-match or override without collision risk.
 */

/** Common em-dash placeholder for empty / unset values. */
export const EM_DASH = "—";

/** Single-character ellipsis used in placeholders like "Select…". */
export const ELLIPSIS = "…";

/** Prefix applied to every generated DOM id by `buildInputId`. */
export const SC_ID_PREFIX = "sc-";

/**
 * Canonical CSS class names exposed by the default render pipelines.
 * Keys are stable identifiers; values are the raw class strings emitted
 * to the DOM. Add new entries here rather than embedding class literals
 * in renderers — `styles.css` cross-references the same names.
 */
export const SC_CLASSES = {
    // Value display
    value: "sc-value",
    valueEmpty: "sc-value sc-value--empty",

    // Form / field structure
    field: "sc-field",
    label: "sc-label",
    input: "sc-input",
    hint: "sc-hint",
    required: "sc-required",

    // Container variants
    object: "sc-object",
    array: "sc-array",
    record: "sc-record",
    tuple: "sc-tuple",
    tupleItem: "sc-tuple-item",
    tupleRest: "sc-tuple-rest",
    tupleIndex: "sc-tuple-index",

    // Discriminated union / tab UI
    discriminatedUnion: "sc-discriminated-union",
    tabs: "sc-tabs",
    tab: "sc-tab",
    tabActive: "sc-tab sc-tab--active",
    tabPanel: "sc-tab-panel",

    // Conditional / negation
    conditional: "sc-conditional",
    conditionalIf: "sc-conditional-if",
    conditionalThen: "sc-conditional-then",
    conditionalElse: "sc-conditional-else",
    negation: "sc-negation",
    never: "sc-never",

    // Recursion sentinel
    recursive: "sc-recursive",
} as const;

/** Stable string-literal key into the canonical {@link SC_CLASSES} map. */
export type ScClassKey = keyof typeof SC_CLASSES;
