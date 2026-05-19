/**
 * Radix Themes adapter for schema-components.
 *
 * Maps schema types to Radix Themes components. Requires
 * `@radix-ui/themes` to be installed in the consuming project:
 * schema-components does not bundle the Radix runtime so consumers stay
 * in control of versioning.
 *
 * @example
 * ```tsx
 * import { createRadixResolver } from "schema-components/themes/radix";
 * import {
 *   Box, Checkbox, Flex, Select, Text, TextField,
 * } from "@radix-ui/themes";
 *
 * const radixResolver = createRadixResolver({
 *   Box,
 *   Checkbox,
 *   Flex,
 *   SelectRoot: Select.Root,
 *   SelectTrigger: Select.Trigger,
 *   SelectContent: Select.Content,
 *   SelectItem: Select.Item,
 *   Text,
 *   TextField: TextField.Root,
 * });
 *
 * <SchemaProvider resolver={radixResolver}>...</SchemaProvider>
 * ```
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
 * Element types the Radix resolver renders into. Each Select.* slot is
 * passed in separately because Radix exposes those parts as nested
 * properties on the `Select` namespace; flattening them into the
 * dependency bag lets the resolver pass them straight to JSX without
 * touching `Select.Root`-style member expressions at render time.
 */
export interface RadixComponents {
    Box: ElementType;
    Checkbox: ElementType;
    Flex: ElementType;
    SelectRoot: ElementType;
    SelectTrigger: ElementType;
    SelectContent: ElementType;
    SelectItem: ElementType;
    Text: ElementType;
    TextField: ElementType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLabel(props: RenderProps): string | undefined {
    if (typeof props.meta.description === "string")
        return props.meta.description;
    return undefined;
}

function stripChildren(
    props: Record<string, unknown>
): Record<string, unknown> {
    const rest = { ...props };
    if ("children" in rest) {
        delete rest.children;
    }
    return rest;
}

// ---------------------------------------------------------------------------
// Renderers — closures over the dependency bag
// ---------------------------------------------------------------------------

function makeRenderStringInput(
    components: RadixComponents
): (props: RenderProps) => ReactNode {
    const { Box, Text, TextField } = components;
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
                    <Box>
                        {label !== undefined && (
                            <Text
                                as="label"
                                size="2"
                                weight="medium"
                                htmlFor={id}
                            >
                                {label}
                            </Text>
                        )}
                        <TextField
                            id={id}
                            type={
                                props.constraints.format === "email"
                                    ? "email"
                                    : props.constraints.format === "uri"
                                      ? "url"
                                      : "text"
                            }
                            value={props.writeOnly ? "" : strValue}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>
                            ) => {
                                props.onChange(e.target.value);
                            }}
                            mt="1"
                            {...aria}
                        />
                    </Box>
                )}
            </FieldShell>
        );
    };
}

function makeRenderNumberInput(
    components: RadixComponents
): (props: RenderProps) => ReactNode {
    const { Box, Text, TextField } = components;
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
                    <Box>
                        {label !== undefined && (
                            <Text
                                as="label"
                                size="2"
                                weight="medium"
                                htmlFor={id}
                            >
                                {label}
                            </Text>
                        )}
                        <TextField
                            id={id}
                            type="number"
                            value={
                                props.writeOnly
                                    ? ""
                                    : typeof props.value === "number"
                                      ? props.value
                                      : ""
                            }
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>
                            ) => {
                                props.onChange(Number(e.target.value));
                            }}
                            mt="1"
                            {...aria}
                        />
                    </Box>
                )}
            </FieldShell>
        );
    };
}

function makeRenderBooleanInput(
    components: RadixComponents
): (props: RenderProps) => ReactNode {
    const { Checkbox, Flex, Text } = components;
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
                    <Flex align="center" gap="2">
                        <Checkbox
                            id={id}
                            checked={
                                props.writeOnly ? false : props.value === true
                            }
                            onCheckedChange={(checked: unknown) => {
                                if (typeof checked === "boolean")
                                    props.onChange(checked);
                            }}
                            {...aria}
                        />
                        {label !== undefined && (
                            <Text as="label" htmlFor={id}>
                                {label}
                            </Text>
                        )}
                    </Flex>
                )}
            </FieldShell>
        );
    };
}

function makeRenderEnumInput(
    components: RadixComponents
): (props: RenderProps) => ReactNode {
    const { Box, Text, SelectRoot, SelectTrigger, SelectContent, SelectItem } =
        components;
    return function renderEnumInput(props) {
        const enumValue = typeof props.value === "string" ? props.value : "";
        const label = getLabel(props);
        const id = inputId(props.path);

        if (props.readOnly) {
            return <Text id={id}>{enumValue || "—"}</Text>;
        }

        return (
            <FieldShell props={props} inputId={id} hideLabel>
                {(aria) => (
                    <Box>
                        {label !== undefined && (
                            <Text
                                as="label"
                                size="2"
                                weight="medium"
                                htmlFor={id}
                            >
                                {label}
                            </Text>
                        )}
                        <SelectRoot
                            value={props.writeOnly ? "" : enumValue}
                            onValueChange={(value: string) => {
                                props.onChange(value);
                            }}
                        >
                            <SelectTrigger id={id} mt="1" {...aria} />
                            <SelectContent>
                                {(props.tree.type === "enum"
                                    ? props.tree.enumValues
                                    : []
                                ).map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </SelectRoot>
                    </Box>
                )}
            </FieldShell>
        );
    };
}

function makeRenderObjectContainer(
    components: RadixComponents
): (props: RenderProps) => ReactNode {
    const { Box, Flex, Text } = components;
    return function renderObjectContainer(props) {
        if (props.tree.type !== "object") return null;
        const fields = props.tree.fields;

        const obj = isObject(props.value) ? props.value : {};

        return (
            <Box>
                {typeof props.meta.description === "string" && (
                    <Text as="div" size="4" weight="bold" mb="3">
                        {props.meta.description}
                    </Text>
                )}
                <Flex direction="column" gap="3">
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
                                <Box key={key}>
                                    {toReactNode(
                                        props.renderChild(
                                            field,
                                            childValue,
                                            childOnChange,
                                            key
                                        )
                                    )}
                                </Box>
                            );
                        })}
                </Flex>
            </Box>
        );
    };
}

// ---------------------------------------------------------------------------
// Default-stub components for the convenience `radixResolver` export
// ---------------------------------------------------------------------------

const STUB_COMPONENTS: RadixComponents = {
    Box: (props: Record<string, unknown>) => <div {...props} />,
    Checkbox: (props: Record<string, unknown>) => (
        <input type="checkbox" {...stripChildren(props)} />
    ),
    Flex: (props: Record<string, unknown>) => <div {...props} />,
    SelectRoot: (props: Record<string, unknown>) => <select {...props} />,
    SelectTrigger: (props: Record<string, unknown>) => <span {...props} />,
    SelectContent: (props: Record<string, unknown>) => <>{props.children}</>,
    SelectItem: (props: Record<string, unknown>) => <option {...props} />,
    Text: (props: Record<string, unknown>) => <span {...props} />,
    TextField: (props: Record<string, unknown>) => (
        <input {...stripChildren(props)} />
    ),
};

// ---------------------------------------------------------------------------
// Factory + exported resolver
// ---------------------------------------------------------------------------

/**
 * Build a Radix-flavoured {@link ComponentResolver} bound to the
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
export function createRadixResolver(
    components: RadixComponents
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
 * Component resolver mapping schema field types to Radix Themes
 * primitives — `Box`, `Checkbox`, `Flex`, `Select.*`, `Text`,
 * `TextField`.
 *
 * Built against minimal HTML stubs so the resolver is usable without
 * wiring up `@radix-ui/themes` first — production usage should call
 * {@link createRadixResolver} with real Radix element types.
 *
 * @group Themes
 * @example
 * ```tsx
 * import * as Radix from "@radix-ui/themes";
 * import { createRadixResolver } from "schema-components/themes/radix";
 *
 * const radixResolver = createRadixResolver({
 *   Box: Radix.Box,
 *   Checkbox: Radix.Checkbox,
 *   Flex: Radix.Flex,
 *   SelectRoot: Radix.Select.Root,
 *   SelectTrigger: Radix.Select.Trigger,
 *   SelectContent: Radix.Select.Content,
 *   SelectItem: Radix.Select.Item,
 *   Text: Radix.Text,
 *   TextField: Radix.TextField.Root,
 * });
 *
 * <SchemaProvider resolver={radixResolver}>
 *   <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * </SchemaProvider>
 * ```
 */
export const radixResolver: ComponentResolver =
    createRadixResolver(STUB_COMPONENTS);
