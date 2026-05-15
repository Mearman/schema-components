/**
 * Radix Themes adapter for schema-components.
 *
 * Maps schema types to Radix Themes components. Requires @radix-ui/themes
 * to be installed in the consuming project and components registered via
 * `registerRadixComponents()`.
 *
 * Usage:
 *   import { radixResolver } from "schema-components/themes/radix";
 *   <SchemaProvider resolver={radixResolver}>...</SchemaProvider>
 *
 * Before first use, register real Radix Themes components:
 *   import { registerRadixComponents } from "schema-components/themes/radix";
 *   import { Box, Checkbox, Flex, Select, Text, TextField } from "@radix-ui/themes";
 *   registerRadixComponents({
 *     Box,
 *     Checkbox,
 *     Flex,
 *     SelectRoot: Select.Root,
 *     SelectTrigger: Select.Trigger,
 *     SelectContent: Select.Content,
 *     SelectItem: Select.Item,
 *     Text,
 *     TextField: TextField.Root,
 *   });
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
// Radix component slots — consumers provide the real components
// ---------------------------------------------------------------------------

let RadixBox: React.ElementType = (props: Record<string, unknown>) => (
    <div {...props} />
);
let RadixCheckbox: React.ElementType = (props: Record<string, unknown>) => (
    <input type="checkbox" {...stripChildren(props)} />
);
let RadixFlex: React.ElementType = (props: Record<string, unknown>) => (
    <div {...props} />
);
let RadixSelectRoot: React.ElementType = (props: Record<string, unknown>) => (
    <select {...props} />
);
let RadixSelectTrigger: React.ElementType = (
    props: Record<string, unknown>
) => <span {...props} />;
let RadixSelectContent: React.ElementType = (
    props: Record<string, unknown>
) => <>{props.children}</>;
let RadixSelectItem: React.ElementType = (props: Record<string, unknown>) => (
    <option {...props} />
);
let RadixText: React.ElementType = (props: Record<string, unknown>) => (
    <span {...props} />
);
let RadixTextField: React.ElementType = (props: Record<string, unknown>) => (
    <input {...stripChildren(props)} />
);

/**
 * Register real Radix Themes components for the resolver to use.
 * Call once at app startup before rendering.
 */
export function registerRadixComponents(components: {
    Box: React.ElementType;
    Checkbox: React.ElementType;
    Flex: React.ElementType;
    SelectRoot: React.ElementType;
    SelectTrigger: React.ElementType;
    SelectContent: React.ElementType;
    SelectItem: React.ElementType;
    Text: React.ElementType;
    TextField: React.ElementType;
}): void {
    RadixBox = components.Box;
    RadixCheckbox = components.Checkbox;
    RadixFlex = components.Flex;
    RadixSelectRoot = components.SelectRoot;
    RadixSelectTrigger = components.SelectTrigger;
    RadixSelectContent = components.SelectContent;
    RadixSelectItem = components.SelectItem;
    RadixText = components.Text;
    RadixTextField = components.TextField;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderStringInput(props: RenderProps): ReactNode {
    const strValue = typeof props.value === "string" ? props.value : "";
    const label = getLabel(props);

    if (props.readOnly) {
        return <RadixText>{strValue || "\u2014"}</RadixText>;
    }

    return (
        <RadixBox>
            {label !== undefined && (
                <RadixText as="label" size="2" weight="medium">
                    {label}
                </RadixText>
            )}
            <RadixTextField
                type={
                    props.constraints.format === "email"
                        ? "email"
                        : props.constraints.format === "uri"
                          ? "url"
                          : "text"
                }
                value={props.writeOnly ? "" : strValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    props.onChange(e.target.value);
                }}
                mt="1"
            />
        </RadixBox>
    );
}

function renderNumberInput(props: RenderProps): ReactNode {
    const label = getLabel(props);

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return <RadixText>{"\u2014"}</RadixText>;
        return <RadixText>{props.value.toLocaleString()}</RadixText>;
    }

    return (
        <RadixBox>
            {label !== undefined && (
                <RadixText as="label" size="2" weight="medium">
                    {label}
                </RadixText>
            )}
            <RadixTextField
                type="number"
                value={
                    props.writeOnly
                        ? ""
                        : typeof props.value === "number"
                          ? props.value
                          : ""
                }
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    props.onChange(Number(e.target.value));
                }}
                mt="1"
            />
        </RadixBox>
    );
}

function renderBooleanInput(props: RenderProps): ReactNode {
    const label = getLabel(props);

    if (props.readOnly) {
        if (typeof props.value !== "boolean")
            return <RadixText>{"\u2014"}</RadixText>;
        return <RadixText>{props.value ? "Yes" : "No"}</RadixText>;
    }

    return (
        <RadixFlex align="center" gap="2">
            <RadixCheckbox
                checked={props.writeOnly ? false : props.value === true}
                onCheckedChange={(checked: unknown) => {
                    if (typeof checked === "boolean") props.onChange(checked);
                }}
            />
            {label !== undefined && <RadixText as="label">{label}</RadixText>}
        </RadixFlex>
    );
}

function renderEnumInput(props: RenderProps): ReactNode {
    const enumValue = typeof props.value === "string" ? props.value : "";
    const label = getLabel(props);

    if (props.readOnly) {
        return <RadixText>{enumValue || "\u2014"}</RadixText>;
    }

    return (
        <RadixBox>
            {label !== undefined && (
                <RadixText as="label" size="2" weight="medium">
                    {label}
                </RadixText>
            )}
            <RadixSelectRoot
                value={props.writeOnly ? "" : enumValue}
                onValueChange={(value: string) => {
                    props.onChange(value);
                }}
            >
                <RadixSelectTrigger mt="1" />
                <RadixSelectContent>
                    {(props.enumValues ?? []).map((value) => (
                        <RadixSelectItem key={value} value={value}>
                            {value}
                        </RadixSelectItem>
                    ))}
                </RadixSelectContent>
            </RadixSelectRoot>
        </RadixBox>
    );
}

function renderObjectContainer(props: RenderProps): ReactNode {
    const fields = props.fields;
    if (fields === undefined) return null;

    const obj = isObject(props.value) ? props.value : {};

    return (
        <RadixBox>
            {typeof props.meta.description === "string" && (
                <RadixText as="div" size="4" weight="bold" mb="3">
                    {props.meta.description}
                </RadixText>
            )}
            <RadixFlex direction="column" gap="3">
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
                            <RadixBox key={key}>
                                {toReactNode(
                                    props.renderChild(
                                        field,
                                        childValue,
                                        childOnChange
                                    )
                                )}
                            </RadixBox>
                        );
                    })}
            </RadixFlex>
        </RadixBox>
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

export const radixResolver: ComponentResolver = buildResolver();
