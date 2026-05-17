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
import { headlessResolver } from "../react/headless.tsx";
import { inputId, toReactNode } from "../react/headlessRenderers.tsx";
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

let MantineTextInput: React.ElementType = (props: Record<string, unknown>) => (
    <input {...props} />
);
let MantineNumberInput: React.ElementType = (
    props: Record<string, unknown>
) => <input type="number" {...props} />;
let MantineSwitch: React.ElementType = (props: Record<string, unknown>) => (
    <input type="checkbox" {...props} />
);
let MantineSelect: React.ElementType = (props: Record<string, unknown>) => (
    <select {...props} />
);
let MantineFieldset: React.ElementType = (props: Record<string, unknown>) => (
    <fieldset {...props} />
);
let MantineText: React.ElementType = (props: Record<string, unknown>) => (
    <span {...props} />
);

/**
 * Register real Mantine components for the resolver to use.
 * Call once at app startup before rendering.
 *
 * `Text` is required so read-only scalars render as a styled Mantine
 * `<Text>` element instead of a bare `<span>`, matching the visual
 * weight of the editable variants.
 */
export function registerMantineComponents(components: {
    TextInput: React.ElementType;
    NumberInput: React.ElementType;
    Switch: React.ElementType;
    Select: React.ElementType;
    Fieldset: React.ElementType;
    Text: React.ElementType;
}): void {
    MantineTextInput = components.TextInput;
    MantineNumberInput = components.NumberInput;
    MantineSwitch = components.Switch;
    MantineSelect = components.Select;
    MantineFieldset = components.Fieldset;
    MantineText = components.Text;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderStringInput(props: RenderProps): ReactNode {
    const strValue = typeof props.value === "string" ? props.value : "";
    const label = getLabel(props);
    const id = inputId(props.path);

    if (props.readOnly) {
        return <MantineText id={id}>{strValue || "\u2014"}</MantineText>;
    }

    return (
        <MantineTextInput
            id={id}
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
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return <MantineText id={id}>{"\u2014"}</MantineText>;
        return (
            <MantineText id={id}>{props.value.toLocaleString()}</MantineText>
        );
    }

    return (
        <MantineNumberInput
            id={id}
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
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "boolean")
            return <MantineText id={id}>{"\u2014"}</MantineText>;
        return <MantineText id={id}>{props.value ? "Yes" : "No"}</MantineText>;
    }

    return (
        <MantineSwitch
            id={id}
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
    const id = inputId(props.path);

    if (props.readOnly) {
        return <MantineText id={id}>{enumValue || "\u2014"}</MantineText>;
    }

    return (
        <MantineSelect
            id={id}
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
                                    childOnChange,
                                    key
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
