/**
 * shadcn/ui theme adapter.
 *
 * Maps schema types to shadcn/ui components. Requires shadcn/ui
 * components to be installed in the consuming project.
 *
 * Usage:
 *   import { shadcnResolver } from "schema-components/themes/shadcn";
 *   <SchemaProvider resolver={shadcnResolver}>...</SchemaProvider>
 *
 * Override individual types by spreading:
 *   const myResolver = { ...shadcnResolver, string: myStringRenderer };
 */

import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { headlessResolver } from "../react/headless.tsx";
import { toReactNode } from "../react/headless.tsx";
import { toRecord } from "../core/guards.ts";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function buildClassNames(...classes: (string | undefined)[]): string {
    return classes.filter(isString).join(" ");
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderStringInput(props: RenderProps): ReactNode {
    const strValue = typeof props.value === "string" ? props.value : "";
    const className = buildClassNames(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50"
    );

    if (props.readOnly) {
        return <span className="text-sm">{strValue || "—"}</span>;
    }

    if (props.writeOnly) {
        return (
            <input
                type={props.constraints.format === "email" ? "email" : "text"}
                className={className}
                placeholder={
                    typeof props.meta.description === "string"
                        ? props.meta.description
                        : undefined
                }
                value=""
                onChange={(e) => {
                    props.onChange(e.target.value);
                }}
            />
        );
    }

    return (
        <input
            type={props.constraints.format === "email" ? "email" : "text"}
            className={className}
            value={strValue}
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

function renderNumberInput(props: RenderProps): ReactNode {
    const className = buildClassNames(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50"
    );

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return <span className="text-sm">—</span>;
        return <span className="text-sm">{props.value.toLocaleString()}</span>;
    }

    return (
        <input
            type="number"
            className={className}
            value={typeof props.value === "number" ? props.value : ""}
            onChange={(e) => {
                props.onChange(Number(e.target.value));
            }}
            min={props.constraints.minimum}
            max={props.constraints.maximum}
        />
    );
}

function renderBooleanInput(props: RenderProps): ReactNode {
    const className = buildClassNames(
        "h-4 w-4 rounded border border-primary shadow",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50"
    );

    if (props.readOnly) {
        if (typeof props.value !== "boolean")
            return <span className="text-sm">—</span>;
        return <span className="text-sm">{props.value ? "Yes" : "No"}</span>;
    }

    return (
        <input
            type="checkbox"
            className={className}
            checked={props.value === true}
            onChange={(e) => {
                props.onChange(e.target.checked);
            }}
        />
    );
}

function renderObjectContainer(props: RenderProps): ReactNode {
    const fields = props.fields;
    if (fields === undefined) return null;

    const obj =
        typeof props.value === "object" &&
        props.value !== null &&
        !Array.isArray(props.value)
            ? props.value
            : {};

    return (
        <div className="space-y-4">
            {typeof props.meta.description === "string" && (
                <h3 className="text-lg font-medium">
                    {props.meta.description}
                </h3>
            )}
            {Object.entries(fields).map(([key, field]) => {
                const childValue = toRecord(obj)[key];
                const childOnChange = (v: unknown) => {
                    const updated: Record<string, unknown> = {};
                    for (const [k, val] of Object.entries(obj)) {
                        updated[k] = val;
                    }
                    updated[key] = v;
                    props.onChange(updated);
                };
                return (
                    <div key={key} className="space-y-1">
                        <label className="text-sm font-medium leading-none">
                            {field.meta.description ?? key}
                        </label>
                        {toReactNode(
                            props.renderChild(field, childValue, childOnChange)
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function renderArrayContainer(props: RenderProps): ReactNode {
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.element;
    if (element === undefined) return null;

    return (
        <div className="space-y-2">
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

function renderEnumInput(props: RenderProps): ReactNode {
    const className = buildClassNames(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50"
    );

    const enumValue = typeof props.value === "string" ? props.value : "";

    if (props.readOnly) {
        return <span className="text-sm">{enumValue || "—"}</span>;
    }

    return (
        <select
            className={className}
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

// ---------------------------------------------------------------------------
// Exported resolver — shadcn/ui components for all schema types
// ---------------------------------------------------------------------------

function buildResolver(): ComponentResolver {
    const resolver: ComponentResolver = {
        string: renderStringInput,
        number: renderNumberInput,
        boolean: renderBooleanInput,
        enum: renderEnumInput,
        object: renderObjectContainer,
        array: renderArrayContainer,
    };
    if (headlessResolver.literal !== undefined)
        resolver.literal = headlessResolver.literal;
    if (headlessResolver.union !== undefined)
        resolver.union = headlessResolver.union;
    if (headlessResolver.record !== undefined)
        resolver.record = headlessResolver.record;
    if (headlessResolver.file !== undefined)
        resolver.file = headlessResolver.file;
    if (headlessResolver.unknown !== undefined)
        resolver.unknown = headlessResolver.unknown;
    return resolver;
}

export const shadcnResolver: ComponentResolver = buildResolver();
