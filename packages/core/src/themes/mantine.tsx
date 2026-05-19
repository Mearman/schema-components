/**
 * Mantine theme adapter for schema-components.
 *
 * Maps schema types to Mantine components. Requires `@mantine/core` to be
 * installed in the consuming project: schema-components does not bundle
 * the Mantine runtime so consumers stay in control of versioning.
 *
 * @example
 * ```tsx
 * import { createMantineResolver } from "schema-components/themes/mantine";
 * import {
 *   TextInput, NumberInput, Switch, Select, Fieldset, Text,
 * } from "@mantine/core";
 *
 * const mantineResolver = createMantineResolver({
 *   TextInput, NumberInput, Switch, Select, Fieldset, Text,
 * });
 *
 * <SchemaProvider resolver={mantineResolver}>...</SchemaProvider>
 * ```
 *
 * Falls back to headless HTML stubs (via mergeResolvers in the React
 * renderer) for types this adapter does not override.
 */

import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { inputId, toReactNode } from "../react/headlessRenderers.tsx";
import { isObject } from "../core/guards.ts";
import { sortFieldsByOrder } from "../core/fieldOrder.ts";
import { FieldShell } from "../react/fieldShell.tsx";
import type { ElementType, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Dependency contract
// ---------------------------------------------------------------------------

/**
 * Element types the Mantine resolver renders into. Every slot is the
 * Mantine component the corresponding render function expects to find
 * at the call site; consumers wire these in once via
 * `createMantineResolver`.
 *
 * `Text` is required so read-only scalars render as a styled Mantine
 * `<Text>` element instead of a bare `<span>`, matching the visual
 * weight of the editable variants.
 */
export interface MantineComponents {
    TextInput: ElementType;
    NumberInput: ElementType;
    Switch: ElementType;
    Select: ElementType;
    Fieldset: ElementType;
    Text: ElementType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLabel(props: RenderProps): string | undefined {
    if (typeof props.meta.description === "string")
        return props.meta.description;
    return undefined;
}

// ---------------------------------------------------------------------------
// Renderers — closures over the dependency bag
// ---------------------------------------------------------------------------

function makeRenderStringInput(
    components: MantineComponents
): (props: RenderProps) => ReactNode {
    const { TextInput, Text } = components;
    return function renderStringInput(props) {
        const strValue = typeof props.value === "string" ? props.value : "";
        const label = getLabel(props);
        const id = inputId(props.path);

        if (props.readOnly) {
            return <Text id={id}>{strValue || "—"}</Text>;
        }

        return (
            <FieldShell props={props} inputId={id} hideLabel>
                {(aria) => (
                    <TextInput
                        id={id}
                        label={label}
                        value={props.writeOnly ? "" : strValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            props.onChange(e.target.value);
                        }}
                        {...aria}
                    />
                )}
            </FieldShell>
        );
    };
}

function makeRenderNumberInput(
    components: MantineComponents
): (props: RenderProps) => ReactNode {
    const { NumberInput, Text } = components;
    return function renderNumberInput(props) {
        const label = getLabel(props);
        const id = inputId(props.path);

        if (props.readOnly) {
            if (typeof props.value !== "number")
                return <Text id={id}>{"—"}</Text>;
            return <Text id={id}>{props.value.toLocaleString()}</Text>;
        }

        return (
            <FieldShell props={props} inputId={id} hideLabel>
                {(aria) => (
                    <NumberInput
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
                        {...aria}
                    />
                )}
            </FieldShell>
        );
    };
}

function makeRenderBooleanInput(
    components: MantineComponents
): (props: RenderProps) => ReactNode {
    const { Switch, Text } = components;
    return function renderBooleanInput(props) {
        const label = getLabel(props);
        const id = inputId(props.path);

        if (props.readOnly) {
            if (typeof props.value !== "boolean")
                return <Text id={id}>{"—"}</Text>;
            return <Text id={id}>{props.value ? "Yes" : "No"}</Text>;
        }

        return (
            <FieldShell props={props} inputId={id} hideLabel>
                {(aria) => (
                    <Switch
                        id={id}
                        label={label}
                        checked={props.writeOnly ? false : props.value === true}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            props.onChange(e.target.checked);
                        }}
                        {...aria}
                    />
                )}
            </FieldShell>
        );
    };
}

function makeRenderEnumInput(
    components: MantineComponents
): (props: RenderProps) => ReactNode {
    const { Select, Text } = components;
    return function renderEnumInput(props) {
        const enumValue = typeof props.value === "string" ? props.value : "";
        const label = getLabel(props);
        const id = inputId(props.path);

        if (props.readOnly) {
            return <Text id={id}>{enumValue || "—"}</Text>;
        }

        const enumValues =
            props.tree.type === "enum" ? props.tree.enumValues : [];

        return (
            <FieldShell props={props} inputId={id} hideLabel>
                {(aria) => (
                    <Select
                        id={id}
                        label={label}
                        value={props.writeOnly ? null : enumValue || null}
                        onChange={(v: unknown) => {
                            if (typeof v === "string") props.onChange(v);
                        }}
                        data={enumValues.map((v) => ({ value: v, label: v }))}
                        {...aria}
                    />
                )}
            </FieldShell>
        );
    };
}

function makeRenderObjectContainer(
    components: MantineComponents
): (props: RenderProps) => ReactNode {
    const { Fieldset } = components;
    return function renderObjectContainer(props) {
        if (props.tree.type !== "object") return null;
        const fields = props.tree.fields;

        const obj = isObject(props.value) ? props.value : {};

        return (
            <Fieldset legend={getLabel(props)}>
                {sortFieldsByOrder(fields)
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
            </Fieldset>
        );
    };
}

// ---------------------------------------------------------------------------
// Default-stub components for the convenience `mantineResolver` export
// ---------------------------------------------------------------------------

const STUB_COMPONENTS: MantineComponents = {
    TextInput: (props: Record<string, unknown>) => <input {...props} />,
    NumberInput: (props: Record<string, unknown>) => (
        <input type="number" {...props} />
    ),
    Switch: (props: Record<string, unknown>) => (
        <input type="checkbox" {...props} />
    ),
    Select: (props: Record<string, unknown>) => <select {...props} />,
    Fieldset: (props: Record<string, unknown>) => <fieldset {...props} />,
    Text: (props: Record<string, unknown>) => <span {...props} />,
};

// ---------------------------------------------------------------------------
// Factory + exported resolver
// ---------------------------------------------------------------------------

/**
 * Build a Mantine-flavoured {@link ComponentResolver} bound to the
 * supplied element types. Each render function captures the supplied
 * components in a closure so two consumers can build different
 * resolvers from the same package without leaking element types
 * through module-level mutable state.
 *
 * Returns only the keys this theme actually overrides. The runtime
 * `mergeResolvers` call inside `<SchemaComponent>` / `<SchemaView>`
 * fills unset keys from `headlessResolver`, so variants this adapter
 * leaves unset (literal, union, discriminatedUnion, array, record,
 * file, unknown, …) still render via the headless fallback.
 *
 * @group Themes
 */
export function createMantineResolver(
    components: MantineComponents
): ComponentResolver {
    return {
        string: makeRenderStringInput(components),
        number: makeRenderNumberInput(components),
        boolean: makeRenderBooleanInput(components),
        enum: makeRenderEnumInput(components),
        object: makeRenderObjectContainer(components),
    };
}

/**
 * Component resolver mapping schema field types to Mantine primitives —
 * `TextInput`, `NumberInput`, `Switch`, `Select`, `Fieldset`, `Text`.
 *
 * Built against minimal HTML stubs so the resolver is usable without
 * wiring up `@mantine/core` first — production usage should call
 * {@link createMantineResolver} with real Mantine element types.
 *
 * @group Themes
 * @example
 * ```tsx
 * import { TextInput, NumberInput, Switch, Select, Fieldset, Text } from "@mantine/core";
 * import { createMantineResolver } from "schema-components/themes/mantine";
 *
 * const mantineResolver = createMantineResolver({
 *   TextInput, NumberInput, Switch, Select, Fieldset, Text,
 * });
 *
 * <SchemaProvider resolver={mantineResolver}>
 *   <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * </SchemaProvider>
 * ```
 */
export const mantineResolver: ComponentResolver =
    createMantineResolver(STUB_COMPONENTS);
