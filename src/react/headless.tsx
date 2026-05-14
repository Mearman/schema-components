/**
 * React headless renderer — the default ComponentResolver implementation.
 *
 * Produces plain HTML elements for every schema type. Theme adapters
 * replace this by implementing ComponentResolver with their own components.
 *
 * This module imports React and lives in the react layer, not core,
 * because it produces ReactNode values.
 */

import { isValidElement, type ReactNode } from "react";
import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { isObject } from "../core/guards.ts";

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
// Headless renderers — one per schema type
// ---------------------------------------------------------------------------

function renderString(props: RenderProps): ReactNode {
    if (props.readOnly) {
        const strValue =
            typeof props.value === "string" ? props.value : undefined;
        if (strValue === undefined || strValue.length === 0)
            return <span>—</span>;
        const format = props.constraints.format;
        if (format === "email")
            return <a href={`mailto:${strValue}`}>{strValue}</a>;
        if (format === "uri" || format === "url")
            return <a href={strValue}>{strValue}</a>;
        return <span>{strValue}</span>;
    }

    const strValue = typeof props.value === "string" ? props.value : "";

    if (props.enumValues !== undefined && props.enumValues.length > 0) {
        return (
            <select
                value={strValue}
                onChange={(e) => {
                    props.onChange(e.target.value);
                }}
            >
                <option value="">Select…</option>
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
        />
    );
}

function renderNumber(props: RenderProps): ReactNode {
    if (props.readOnly) {
        if (typeof props.value !== "number") return <span>—</span>;
        return <span>{props.value.toLocaleString()}</span>;
    }

    const numValue = typeof props.value === "number" ? props.value : "";
    return (
        <input
            type="number"
            value={props.writeOnly ? "" : numValue}
            onChange={(e) => {
                props.onChange(Number(e.target.value));
            }}
            min={props.constraints.minimum}
            max={props.constraints.maximum}
        />
    );
}

function renderBoolean(props: RenderProps): ReactNode {
    if (props.readOnly) {
        if (typeof props.value !== "boolean") return <span>—</span>;
        return <span>{props.value ? "Yes" : "No"}</span>;
    }

    return (
        <input
            type="checkbox"
            checked={props.value === true}
            onChange={(e) => {
                props.onChange(e.target.checked);
            }}
        />
    );
}

function renderEnum(props: RenderProps): ReactNode {
    const enumValue = typeof props.value === "string" ? props.value : "";

    if (props.readOnly) {
        return <span>{enumValue || "—"}</span>;
    }

    return (
        <select
            value={props.writeOnly ? "" : enumValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
        >
            <option value="">Select…</option>
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
                            <label>{field.meta.description}</label>
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
        <div>
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

function renderUnknown(props: RenderProps): ReactNode {
    if (props.readOnly) {
        if (props.value === undefined || props.value === null)
            return <span>—</span>;
        return (
            <span>
                {typeof props.value === "string"
                    ? props.value
                    : JSON.stringify(props.value)}
            </span>
        );
    }

    const strValue = typeof props.value === "string" ? props.value : "";
    return (
        <input
            type="text"
            value={props.writeOnly ? "" : strValue}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
        />
    );
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
    unknown: renderUnknown,
};
