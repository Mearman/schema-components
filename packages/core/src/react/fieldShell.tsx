/**
 * Shared field shell for React theme adapters.
 *
 * Wraps a host primitive (the actual `<input>` / `<select>` / `<Switch>`
 * etc.) with:
 *
 *   1. an optional `<label htmlFor>` carrying the field description
 *      and a required indicator,
 *   2. the input itself, with ARIA attributes plumbed via
 *      `buildAriaAttrs` — `aria-required`, `aria-describedby`,
 *      `aria-label` — so screen-reader behaviour matches the headless
 *      renderer,
 *   3. an optional constraint-hint `<small>` element wired to the
 *      input via `aria-describedby`.
 *
 * Theme adapters compose around the shell rather than re-implementing
 * the label / hint / required indicator from scratch. The render
 * function is passed in so each theme controls the actual host primitive
 * (e.g. shadcn renders a styled `<input>`, mui a `TextField`, etc.) while
 * the accessibility scaffolding stays identical across themes.
 *
 * `inputId` is required because every ARIA attribute the shell emits
 * targets a specific element id. The renderer should reuse the supplied
 * id on the host primitive it returns from `renderInput` — the helper
 * does NOT inject the id automatically (the host primitive's prop name
 * for id can vary between libraries).
 */

import type { ReactNode } from "react";
import type { RenderProps } from "../core/renderer.ts";
import { buildAriaAttrs, constraintHint, isFieldRequired } from "./a11y.ts";

/**
 * Render-time inputs to {@link FieldShell}. The shell does not depend
 * on a theme; it consumes only the field metadata the walker has
 * already produced.
 */
export interface FieldShellProps {
    /** The walked field props passed to the theme's render function. */
    readonly props: RenderProps;
    /** Stable DOM id for the host input. */
    readonly inputId: string;
    /**
     * Children-as-function. Receives the ARIA attribute bundle so the
     * caller can spread the attributes onto whatever element it
     * produces; the shell does not inject them because the spread
     * point varies between libraries (`inputProps`, top-level, slot
     * props, …).
     */
    readonly children: (ariaAttrs: Record<string, string>) => ReactNode;
    /**
     * Optional override for the label text. Defaults to
     * `props.meta.description` when undefined.
     */
    readonly label?: string;
    /**
     * When true, suppress the wrapping `<label>` element. Useful for
     * adapters whose host primitive (e.g. MUI's `TextField`) already
     * renders its own label.
     */
    readonly hideLabel?: boolean;
}

/**
 * Compose label, host primitive, and constraint hint around a render
 * function supplied by the theme adapter. Returns plain JSX — no
 * theme-specific element types — so the same shell works under
 * shadcn, MUI, Mantine, Radix, or any custom theme.
 */
export function FieldShell({
    props,
    inputId,
    children,
    label,
    hideLabel,
}: FieldShellProps): ReactNode {
    const description =
        typeof label === "string"
            ? label
            : typeof props.meta.description === "string"
              ? props.meta.description
              : undefined;
    const required = isFieldRequired(props.tree);
    const hint = constraintHint(inputId, props.constraints);

    // Pass the inputId + constraints to buildAriaAttrs so the
    // `aria-describedby` value matches the rendered hint element id.
    const ariaAttrs = buildAriaAttrs(
        props.tree,
        description,
        inputId,
        props.constraints
    );

    return (
        <div className="sc-field">
            {hideLabel !== true && description !== undefined && (
                <label htmlFor={inputId}>
                    {description}
                    {required && (
                        <span
                            aria-hidden="true"
                            className="sc-required"
                            style={{ color: "#dc2626" }}
                        >
                            {" "}
                            *
                        </span>
                    )}
                </label>
            )}
            {children(ariaAttrs)}
            {hint !== undefined && (
                <small className="sc-hint" id={hint.id}>
                    {hint.text}
                </small>
            )}
        </div>
    );
}
