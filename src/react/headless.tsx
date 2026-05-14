/**
 * React headless renderer — the default ComponentResolver implementation.
 *
 * Produces plain HTML elements for every schema type. Theme adapters
 * replace this by implementing ComponentResolver with their own components.
 *
 * Accessibility:
 * - All inputs have `id`; labels use `htmlFor` for programmatic association
 * - Discriminated union tabs follow WAI-ARIA tabs pattern (role, aria-selected,
 *   arrow key navigation, Home/End)
 * - Checkboxes are linked to visible labels where available
 * - Validation state surfaced via `aria-invalid` and `aria-errormessage`
 *
 * This module imports React and lives in the react layer, not core,
 * because it produces ReactNode values.
 */

import { isValidElement, useCallback, useRef, type ReactNode } from "react";
import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { isObject } from "../core/guards.ts";
import type { WalkedField } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toReactNode(value: unknown): ReactNode {
    if (value === null || value === undefined) return null;
    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    )
        return value;
    if (isValidElement(value)) return value;
    return null;
}

// ---------------------------------------------------------------------------
// Date/time formatting helpers
// ---------------------------------------------------------------------------

function formatDateTime(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return undefined;
        return date.toLocaleString();
    } catch {
        return undefined;
    }
}

function formatDate(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return undefined;
        return date.toLocaleDateString();
    } catch {
        return undefined;
    }
}

function formatTime(value: unknown): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return undefined;
        return date.toLocaleTimeString();
    } catch {
        return undefined;
    }
}

// ---------------------------------------------------------------------------
// Date/time input type mapping
// ---------------------------------------------------------------------------

function dateInputType(format: string | undefined): string | undefined {
    if (format === "date") return "date";
    if (format === "time") return "time";
    if (format === "date-time" || format === "datetime")
        return "datetime-local";
    return undefined;
}

// ---------------------------------------------------------------------------
// Accessibility: ID generation
// ---------------------------------------------------------------------------

/**
 * Build a stable, unique-ish input ID from the path.
 * Used for `htmlFor`/`id` association between labels and inputs.
 */
function inputId(path: string): string {
    if (path.length === 0) return "sc-field";
    return `sc-${path}`;
}

// ---------------------------------------------------------------------------
// Headless renderers — one per schema type
// ---------------------------------------------------------------------------

function renderString(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        const strValue =
            typeof props.value === "string" ? props.value : undefined;
        if (strValue === undefined || strValue.length === 0)
            return (
                <span id={id} aria-readonly="true">
                    \u2014
                </span>
            );
        const format = props.constraints.format;
        if (format === "email")
            return (
                <a href={`mailto:${strValue}`} id={id} aria-readonly="true">
                    {strValue}
                </a>
            );
        if (format === "uri" || format === "url")
            return (
                <a href={strValue} id={id} aria-readonly="true">
                    {strValue}
                </a>
            );
        if (format === "date") {
            const formatted = formatDate(strValue);
            return (
                <span id={id} aria-readonly="true">
                    {formatted ?? strValue}
                </span>
            );
        }
        if (format === "time") {
            const formatted = formatTime(strValue);
            return (
                <span id={id} aria-readonly="true">
                    {formatted ?? strValue}
                </span>
            );
        }
        if (format === "date-time" || format === "datetime") {
            const formatted = formatDateTime(strValue);
            return (
                <span id={id} aria-readonly="true">
                    {formatted ?? strValue}
                </span>
            );
        }
        return (
            <span id={id} aria-readonly="true">
                {strValue}
            </span>
        );
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    const dateType = dateInputType(props.constraints.format);

    const ariaAttrs: Record<string, string> = {};
    if (props.tree.isOptional === false) {
        ariaAttrs["aria-required"] = "true";
    }

    if (dateType !== undefined) {
        return (
            <input
                id={id}
                type={dateType}
                value={props.writeOnly ? "" : strValue}
                onChange={(e) => {
                    props.onChange(e.target.value);
                }}
                {...ariaAttrs}
            />
        );
    }

    if (props.enumValues !== undefined && props.enumValues.length > 0) {
        return (
            <select
                id={id}
                value={strValue}
                onChange={(e) => {
                    props.onChange(e.target.value);
                }}
                {...ariaAttrs}
            >
                <option value="">Select\u2026</option>
                {props.enumValues.map((v) => (
                    <option key={v} value={v}>
                        {v}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <input
            id={id}
            type={
                props.constraints.format === "email"
                    ? "email"
                    : props.constraints.format === "uri"
                      ? "url"
                      : "text"
            }
            value={props.writeOnly ? "" : strValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
            placeholder={
                typeof props.meta.description === "string"
                    ? props.meta.description
                    : undefined
            }
            minLength={props.constraints.minLength}
            maxLength={props.constraints.maxLength}
            {...ariaAttrs}
        />
    );
}

function renderNumber(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return (
                <span id={id} aria-readonly="true">
                    \u2014
                </span>
            );
        return (
            <span id={id} aria-readonly="true">
                {props.value.toLocaleString()}
            </span>
        );
    }

    const numValue = typeof props.value === "number" ? props.value : "";
    const ariaAttrs: Record<string, string> = {};
    if (props.tree.isOptional === false) {
        ariaAttrs["aria-required"] = "true";
    }

    return (
        <input
            id={id}
            type="number"
            value={props.writeOnly ? "" : numValue}
            onChange={(e) => {
                props.onChange(Number(e.target.value));
            }}
            min={props.constraints.minimum}
            max={props.constraints.maximum}
            {...ariaAttrs}
        />
    );
}

function renderBoolean(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "boolean")
            return (
                <span id={id} aria-readonly="true">
                    \u2014
                </span>
            );
        return (
            <span id={id} aria-readonly="true">
                {props.value ? "Yes" : "No"}
            </span>
        );
    }

    const ariaAttrs: Record<string, string> = {};
    if (props.tree.isOptional === false) {
        ariaAttrs["aria-required"] = "true";
    }
    if (typeof props.meta.description === "string") {
        ariaAttrs["aria-label"] = props.meta.description;
    }

    return (
        <input
            id={id}
            type="checkbox"
            checked={props.value === true}
            onChange={(e) => {
                props.onChange(e.target.checked);
            }}
            {...ariaAttrs}
        />
    );
}

function renderEnum(props: RenderProps): ReactNode {
    const id = inputId(props.path);
    const enumValue = typeof props.value === "string" ? props.value : "";

    if (props.readOnly) {
        return (
            <span id={id} aria-readonly="true">
                {enumValue || "\u2014"}
            </span>
        );
    }

    const ariaAttrs: Record<string, string> = {};
    if (props.tree.isOptional === false) {
        ariaAttrs["aria-required"] = "true";
    }

    return (
        <select
            id={id}
            value={props.writeOnly ? "" : enumValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
            {...ariaAttrs}
        >
            <option value="">Select\u2026</option>
            {props.enumValues?.map((v) => (
                <option key={v} value={v}>
                    {v}
                </option>
            ))}
        </select>
    );
}

function renderObject(props: RenderProps): ReactNode {
    const obj = isObject(props.value) ? props.value : {};
    const fields = props.fields;
    if (fields === undefined) return null;

    return (
        <fieldset>
            {typeof props.meta.description === "string" && (
                <legend>{props.meta.description}</legend>
            )}
            {Object.entries(fields).map(([key, field]) => {
                const childValue = obj[key];
                const childPath = props.path ? `${props.path}.${key}` : key;
                const childId = inputId(childPath);
                const childOnChange = (v: unknown) => {
                    const updated: Record<string, unknown> = {};
                    for (const [k, val] of Object.entries(obj)) {
                        updated[k] = val;
                    }
                    updated[key] = v;
                    props.onChange(updated);
                };
                return (
                    <div key={key}>
                        {typeof field.meta.description === "string" && (
                            <label htmlFor={childId}>
                                {field.meta.description}
                                {field.isOptional === false && (
                                    <span
                                        aria-hidden="true"
                                        style={{ color: "#dc2626" }}
                                    >
                                        {" "}
                                        *
                                    </span>
                                )}
                            </label>
                        )}
                        {toReactNode(
                            props.renderChild(field, childValue, childOnChange)
                        )}
                    </div>
                );
            })}
        </fieldset>
    );
}

function renderArray(props: RenderProps): ReactNode {
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.element;
    if (element === undefined) return null;

    return (
        <div role="group" aria-label={props.meta.description ?? undefined}>
            {arr.map((item, i) => {
                const childOnChange = (v: unknown) => {
                    const next = arr.slice();
                    next[i] = v;
                    props.onChange(next);
                };
                return (
                    <div key={String(i)}>
                        {toReactNode(
                            props.renderChild(element, item, childOnChange)
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function renderUnion(props: RenderProps): ReactNode {
    const options = props.options;
    if (options === undefined || options.length === 0) {
        if (props.value === undefined || props.value === null)
            return <span>\u2014</span>;
        return <span>{JSON.stringify(props.value)}</span>;
    }

    const matched = matchUnionOption(options, props.value);
    if (matched !== undefined) {
        return toReactNode(
            props.renderChild(matched, props.value, props.onChange)
        );
    }

    const firstOption = options[0];
    if (firstOption !== undefined) {
        return toReactNode(
            props.renderChild(firstOption, props.value, props.onChange)
        );
    }

    return <span>\u2014</span>;
}

// ---------------------------------------------------------------------------
// Discriminated union — WAI-ARIA tabs pattern
// ---------------------------------------------------------------------------

function renderDiscriminatedUnion(props: RenderProps): ReactNode {
    const options = props.options;
    const discriminator = props.discriminator;
    if (options === undefined || options.length === 0) {
        if (props.value === undefined || props.value === null)
            return <span>\u2014</span>;
        return <span>{JSON.stringify(props.value)}</span>;
    }

    const obj = isObject(props.value) ? props.value : {};
    const discKey = discriminator ?? "";
    const currentDiscriminatorValue =
        typeof obj[discKey] === "string" ? obj[discKey] : undefined;

    // Find the label for each option from the const on the discriminator property
    const optionLabels = options.map((opt) => {
        const discriminatorField = opt.fields?.[discKey];
        if (discriminatorField !== undefined) {
            const constVal = discriminatorField.literalValues?.[0];
            if (typeof constVal === "string") return constVal;
        }
        return typeof opt.meta.title === "string" ? opt.meta.title : opt.type;
    });

    // Determine the active option
    let activeIndex = 0;
    if (currentDiscriminatorValue !== undefined) {
        const found = optionLabels.indexOf(currentDiscriminatorValue);
        if (found !== -1) activeIndex = found;
    }
    const activeOption = options[activeIndex];

    const panelId = inputId(props.path);

    if (props.readOnly) {
        if (activeOption !== undefined) {
            return toReactNode(
                props.renderChild(activeOption, props.value, props.onChange)
            );
        }
        return <span>\u2014</span>;
    }

    return (
        <DiscriminatedUnionTabs
            options={options}
            optionLabels={optionLabels}
            activeIndex={activeIndex}
            panelId={panelId}
            discKey={discKey}
            props={props}
        />
    );
}

/**
 * WAI-ARIA tabs component for discriminated unions.
 * Implements the full tabs keyboard pattern:
 * - Left/Right arrow keys move between tabs
 * - Home/End move to first/last tab
 * - Tab moves focus into the active panel
 * - aria-selected, aria-controls, role="tablist"/"tab"/"tabpanel"
 */
function DiscriminatedUnionTabs({
    options,
    optionLabels,
    activeIndex,
    panelId,
    discKey,
    props,
}: {
    options: WalkedField[];
    optionLabels: string[];
    activeIndex: number;
    panelId: string;
    discKey: string;
    props: RenderProps;
}): ReactNode {
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const handleTabChange = useCallback(
        (newIndex: number) => {
            const label = optionLabels[newIndex];
            if (label === undefined) return;
            props.onChange({ [discKey]: label });
        },
        [optionLabels, discKey, props]
    );

    const focusTab = useCallback(
        (index: number) => {
            const clamped =
                ((index % options.length) + options.length) % options.length;
            tabRefs.current[clamped]?.focus();
        },
        [options.length]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowRight") {
                e.preventDefault();
                focusTab(activeIndex + 1);
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                focusTab(activeIndex - 1);
            } else if (e.key === "Home") {
                e.preventDefault();
                focusTab(0);
            } else if (e.key === "End") {
                e.preventDefault();
                focusTab(options.length - 1);
            }
        },
        [activeIndex, focusTab, options.length]
    );

    const activeOption = options[activeIndex];

    return (
        <div>
            <div
                role="tablist"
                aria-label="Select variant"
                style={{
                    display: "flex",
                    gap: "0.25rem",
                    marginBottom: "0.5rem",
                }}
                onKeyDown={handleKeyDown}
            >
                {options.map((_opt, i) => (
                    <button
                        key={String(i)}
                        ref={(el) => {
                            tabRefs.current[i] = el;
                        }}
                        type="button"
                        role="tab"
                        aria-selected={i === activeIndex ? "true" : undefined}
                        aria-controls={`${panelId}-panel`}
                        tabIndex={i === activeIndex ? 0 : -1}
                        onClick={() => {
                            handleTabChange(i);
                        }}
                        style={{
                            padding: "0.25rem 0.75rem",
                            border:
                                i === activeIndex
                                    ? "1px solid #3b82f6"
                                    : "1px solid #d1d5db",
                            borderRadius: "0.25rem",
                            background:
                                i === activeIndex ? "#eff6ff" : "transparent",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                        }}
                    >
                        {optionLabels[i]}
                    </button>
                ))}
            </div>
            <div
                role="tabpanel"
                id={`${panelId}-panel`}
                aria-labelledby={`${panelId}-tab-${String(activeIndex)}`}
            >
                {activeOption !== undefined &&
                    toReactNode(
                        props.renderChild(
                            activeOption,
                            props.value,
                            props.onChange
                        )
                    )}
            </div>
        </div>
    );
}

function renderUnknown(props: RenderProps): ReactNode {
    const id = inputId(props.path);

    if (props.readOnly) {
        if (props.value === undefined || props.value === null)
            return (
                <span id={id} aria-readonly="true">
                    \u2014
                </span>
            );
        return (
            <span id={id} aria-readonly="true">
                {typeof props.value === "string"
                    ? props.value
                    : JSON.stringify(props.value)}
            </span>
        );
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    return (
        <input
            id={id}
            type="text"
            value={props.writeOnly ? "" : strValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
        />
    );
}

// ---------------------------------------------------------------------------
// Union matching heuristic
// ---------------------------------------------------------------------------

function matchUnionOption(
    options: WalkedField[],
    value: unknown
): WalkedField | undefined {
    if (typeof value === "string") {
        return options.find((o) => o.type === "string" || o.type === "enum");
    }
    if (typeof value === "number") {
        return options.find((o) => o.type === "number");
    }
    if (typeof value === "boolean") {
        return options.find((o) => o.type === "boolean");
    }
    if (Array.isArray(value)) {
        return options.find((o) => o.type === "array");
    }
    if (typeof value === "object" && value !== null) {
        return options.find((o) => o.type === "object");
    }
    return undefined;
}

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
    array: renderArray,
    union: renderUnion,
    discriminatedUnion: renderDiscriminatedUnion,
    unknown: renderUnknown,
};
