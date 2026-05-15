/**
 * Mantine theme adapter for schema-components.
 *
 * Maps schema types to Mantine components. Requires @mantine/core
 * to be installed in the consuming project and components registered
 * via `registerMantineComponents()`.
 *
 * Usage:
 *   import { mantineResolver } from "schema-components/themes/mantine";
 *   <SchemaProvider resolver={mantineResolver}>...</SchemaProvider>
 *
 * Before first use, register real Mantine components:
 *   import { registerMantineComponents } from "schema-components/themes/mantine";
 *   import { TextInput, NumberInput, Switch, Select, Fieldset } from "@mantine/core";
 *   registerMantineComponents({ TextInput, NumberInput, Switch, Select, Fieldset });
 *
 * Falls back to headless HTML stubs for types without Mantine components
 * (literal, union, discriminatedUnion, array, record, file, unknown).
 */

import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { headlessResolver, toReactNode } from "../react/headless.tsx";
import { isObject } from "../core/guards.ts";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLabel(props: RenderProps): string | undefined {
    if (typeof props.meta.description === "string")
        return props.meta.description;
    return undefined;
}

// ---------------------------------------------------------------------------
// Mantine component slots — consumers provide the real components
// ---------------------------------------------------------------------------

let MantineTextInput: React.ComponentType<Record<string, unknown>> = (
    props
) => <input {...props} />;
let MantineNumberInput: React.ComponentType<Record<string, unknown>> = (
    props
) => <input type="number" {...props} />;
let MantineSwitch: React.ComponentType<Record<string, unknown>> = (props) => (
    <input type="checkbox" {...props} />
);
let MantineSelect: React.ComponentType<Record<string, unknown>> = (props) => (
    <select {...props} />
);
let MantineFieldset: React.ComponentType<Record<string, unknown>> = (props) => (
    <fieldset {...props} />
);

// Narrow unknown → ComponentType at the library boundary.
// Third-party component props are incompatible with Record<string, unknown>;
// the adapter only passes props it knows about.
function toComponent(
    value: unknown
): React.ComponentType<Record<string, unknown>> {
    // React components may be functions or forwardRef objects with a render property.
    if (typeof value === "function") {
        // @ts-expect-error -- Library boundary: Function is not assignable to ComponentType<Record<string, unknown>>
        return value;
    }
    if (typeof value === "object" && value !== null && "render" in value) {
        // @ts-expect-error -- Library boundary: forwardRef object is not assignable to ComponentType
        return value;
    }
    throw new Error(`Expected a React component, got ${typeof value}`);
}

/**
 * Register real Mantine components for the resolver to use.
 * Call once at app startup before rendering.
 */
export function registerMantineComponents(components: {
    TextInput: unknown;
    NumberInput: unknown;
    Switch: unknown;
    Select: unknown;
    Fieldset: unknown;
}): void {
    MantineTextInput = toComponent(components.TextInput);
    MantineNumberInput = toComponent(components.NumberInput);
    MantineSwitch = toComponent(components.Switch);
    MantineSelect = toComponent(components.Select);
    MantineFieldset = toComponent(components.Fieldset);
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderStringInput(props: RenderProps): ReactNode {
    const strValue = typeof props.value === "string" ? props.value : "";
    const label = getLabel(props);

    if (props.readOnly) {
        return <span>{strValue || "\u2014"}</span>;
    }

    return (
        <MantineTextInput
            label={label}
            value={props.writeOnly ? "" : strValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                props.onChange(e.target.value);
            }}
        />
    );
}

function renderNumberInput(props: RenderProps): ReactNode {
    const label = getLabel(props);

    if (props.readOnly) {
        if (typeof props.value !== "number") return <span>{"\u2014"}</span>;
        return <span>{props.value.toLocaleString()}</span>;
    }

    return (
        <MantineNumberInput
            label={label}
            value={
                props.writeOnly
                    ? undefined
                    : typeof props.value === "number"
                      ? props.value
                      : undefined
            }
            onChange={(v: unknown) => {
                if (typeof v === "number") props.onChange(v);
            }}
        />
    );
}

function renderBooleanInput(props: RenderProps): ReactNode {
    const label = getLabel(props);

    if (props.readOnly) {
        if (typeof props.value !== "boolean") return <span>{"\u2014"}</span>;
        return <span>{props.value ? "Yes" : "No"}</span>;
    }

    return (
        <MantineSwitch
            label={label}
            checked={props.writeOnly ? false : props.value === true}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                props.onChange(e.target.checked);
            }}
        />
    );
}

function renderEnumInput(props: RenderProps): ReactNode {
    const enumValue = typeof props.value === "string" ? props.value : "";
    const label = getLabel(props);

    if (props.readOnly) {
        return <span>{enumValue || "\u2014"}</span>;
    }

    return (
        <MantineSelect
            label={label}
            value={props.writeOnly ? null : enumValue || null}
            onChange={(v: unknown) => {
                if (typeof v === "string") props.onChange(v);
            }}
            data={(props.enumValues ?? []).map((v) => ({ value: v, label: v }))}
        />
    );
}

function renderObjectContainer(props: RenderProps): ReactNode {
    const fields = props.fields;
    if (fields === undefined) return null;

    const obj = isObject(props.value) ? props.value : {};

    return (
        <MantineFieldset legend={getLabel(props)}>
            {Object.entries(fields)
                .filter(([, field]) => field.meta.visible !== false)
                .map(([key, field]) => {
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
                        <div key={key} style={{ marginBottom: "0.5rem" }}>
                            {toReactNode(
                                props.renderChild(
                                    field,
                                    childValue,
                                    childOnChange
                                )
                            )}
                        </div>
                    );
                })}
        </MantineFieldset>
    );
}

// ---------------------------------------------------------------------------
// Exported resolver
// ---------------------------------------------------------------------------

function buildResolver(): ComponentResolver {
    const resolver: ComponentResolver = {
        string: renderStringInput,
        number: renderNumberInput,
        boolean: renderBooleanInput,
        enum: renderEnumInput,
        object: renderObjectContainer,
    };
    if (headlessResolver.literal !== undefined)
        resolver.literal = headlessResolver.literal;
    if (headlessResolver.union !== undefined)
        resolver.union = headlessResolver.union;
    if (headlessResolver.discriminatedUnion !== undefined)
        resolver.discriminatedUnion = headlessResolver.discriminatedUnion;
    if (headlessResolver.array !== undefined)
        resolver.array = headlessResolver.array;
    if (headlessResolver.record !== undefined)
        resolver.record = headlessResolver.record;
    if (headlessResolver.file !== undefined)
        resolver.file = headlessResolver.file;
    if (headlessResolver.unknown !== undefined)
        resolver.unknown = headlessResolver.unknown;
    return resolver;
}

export const mantineResolver: ComponentResolver = buildResolver();
