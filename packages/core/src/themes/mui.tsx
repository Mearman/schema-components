/**
 * MUI (Material UI) theme adapter.
 *
 * Maps schema types to MUI components. Requires @mui/material
 * to be installed in the consuming project.
 *
 * Usage:
 *   import { muiResolver } from "schema-components/themes/mui";
 *   <SchemaProvider resolver={muiResolver}>...</SchemaProvider>
 *
 * Override individual types by spreading:
 *   const myResolver = { ...muiResolver, string: myStringRenderer };
 */

import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { headlessResolver } from "../react/headless.tsx";
import { inputId, toReactNode } from "../react/headlessRenderers.tsx";
import { isObject } from "../core/guards.ts";
import { isValidElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ariaRequired(tree: import("../core/types.ts").WalkedField): {
    required: boolean;
} {
    return { required: tree.isOptional === false };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderStringInput(props: RenderProps): ReactNode {
    const strValue = typeof props.value === "string" ? props.value : "";
    const label =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined;
    const id = inputId(props.path);

    if (props.readOnly) {
        return (
            <MuiTypography id={id} variant="body2">
                {strValue || "\u2014"}
            </MuiTypography>
        );
    }

    return (
        <MuiTextField
            id={id}
            label={label}
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
            fullWidth
            size="small"
            variant="outlined"
            inputProps={{
                minLength: props.constraints.minLength,
                maxLength: props.constraints.maxLength,
            }}
            {...ariaRequired(props.tree)}
        />
    );
}

function renderNumberInput(props: RenderProps): ReactNode {
    const label =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined;
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return (
                <MuiTypography id={id} variant="body2">
                    {"\u2014"}
                </MuiTypography>
            );
        return (
            <MuiTypography id={id} variant="body2">
                {props.value.toLocaleString()}
            </MuiTypography>
        );
    }

    return (
        <MuiTextField
            id={id}
            label={label}
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
            fullWidth
            size="small"
            variant="outlined"
            inputProps={{
                min: props.constraints.minimum,
                max: props.constraints.maximum,
            }}
            {...ariaRequired(props.tree)}
        />
    );
}

function renderBooleanInput(props: RenderProps): ReactNode {
    const label =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined;
    const id = inputId(props.path);

    if (props.readOnly) {
        if (typeof props.value !== "boolean")
            return (
                <MuiTypography id={id} variant="body2">
                    {"\u2014"}
                </MuiTypography>
            );
        return (
            <MuiTypography id={id} variant="body2">
                {props.value ? "Yes" : "No"}
            </MuiTypography>
        );
    }

    return (
        <MuiFormControlLabel
            control={
                <MuiCheckbox
                    id={id}
                    checked={props.writeOnly ? false : props.value === true}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        props.onChange(e.target.checked);
                    }}
                />
            }
            label={label}
        />
    );
}

function renderEnumInput(props: RenderProps): ReactNode {
    const enumValue = typeof props.value === "string" ? props.value : "";
    const label =
        typeof props.meta.description === "string"
            ? props.meta.description
            : undefined;
    const id = inputId(props.path);

    if (props.readOnly) {
        return (
            <MuiTypography id={id} variant="body2">
                {enumValue || "\u2014"}
            </MuiTypography>
        );
    }

    return (
        <MuiTextField
            id={id}
            select
            label={label}
            value={props.writeOnly ? "" : enumValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                props.onChange(e.target.value);
            }}
            fullWidth
            size="small"
            variant="outlined"
            {...ariaRequired(props.tree)}
        >
            <MuiMenuItem value="">Select{"\u2026"}</MuiMenuItem>
            {(props.tree.type === "enum" ? props.tree.enumValues : []).map(
                (v) => (
                    <MuiMenuItem key={v} value={v}>
                        {v}
                    </MuiMenuItem>
                )
            )}
        </MuiTextField>
    );
}

function renderObjectContainer(props: RenderProps): ReactNode {
    if (props.tree.type !== "object") return null;
    const fields = props.tree.fields;

    const obj = isObject(props.value) ? props.value : {};

    return (
        <MuiBox sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {typeof props.meta.description === "string" && (
                <MuiTypography variant="h6">
                    {props.meta.description}
                </MuiTypography>
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
        </MuiBox>
    );
}

function renderArrayContainer(props: RenderProps): ReactNode {
    const arr = Array.isArray(props.value) ? props.value : [];
    if (props.tree.type !== "array") return null;
    const element = props.tree.element;
    if (element === undefined) return null;

    return (
        <MuiBox sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {arr.map((item, i) => {
                const childOnChange = (v: unknown) => {
                    const next = arr.slice();
                    next[i] = v;
                    props.onChange(next);
                };
                return (
                    <div key={String(i)}>
                        {toReactNode(
                            props.renderChild(
                                element,
                                item,
                                childOnChange,
                                `[${String(i)}]`
                            )
                        )}
                    </div>
                );
            })}
        </MuiBox>
    );
}

// ---------------------------------------------------------------------------
// MUI component stubs — consumers provide the real components
// ---------------------------------------------------------------------------

/**
 * MUI components are not bundled with this adapter.
 * Instead, the resolver uses thin wrapper components that delegate to
 * the consuming project's MUI installation.
 *
 * This avoids a hard dependency on @mui/material while providing
 * type-safe rendering. If MUI is not installed, these wrappers
 * render basic HTML elements as fallback.
 *
 * To use real MUI components, wrap your app with MuiProvider:
 *   import { MuiProvider } from "schema-components/themes/mui";
 *   import { TextField, Checkbox, ... } from "@mui/material";
 *
 *   <MuiProvider
 *     TextField={TextField}
 *     Checkbox={Checkbox}
 *     ...
 *   >
 *     <SchemaComponent ... />
 *   </MuiProvider>
 */

// Stub components — default to basic HTML elements
function stripChildren(
    props: Record<string, unknown>
): Record<string, unknown> {
    const rest = { ...props };
    if ("children" in rest) {
        delete rest.children;
    }
    return rest;
}

let MuiTextField: React.ElementType = (props: Record<string, unknown>) => (
    <input {...stripChildren(props)} />
);
let MuiCheckbox: React.ElementType = (props: Record<string, unknown>) => (
    <input type="checkbox" {...stripChildren(props)} />
);
let MuiTypography: React.ElementType = (props: Record<string, unknown>) => (
    <span {...props} />
);
let MuiBox: React.ElementType = (props: Record<string, unknown>) => (
    <div {...props} />
);
let MuiMenuItem: React.ElementType = (props: Record<string, unknown>) => (
    <option {...props} />
);
let MuiFormControlLabel: React.ElementType = (
    props: Record<string, unknown>
) => {
    const { control, label, ...rest } = props;
    return (
        <label {...rest}>
            {isValidElement(control) ? control : null}
            {typeof label === "string" ? label : null}
        </label>
    );
};

/**
 * Register real MUI components. Call once at app startup.
 */
export function registerMuiComponents(components: {
    TextField: React.ElementType;
    Checkbox: React.ElementType;
    Typography: React.ElementType;
    Box: React.ElementType;
    MenuItem: React.ElementType;
    FormControlLabel: React.ElementType;
}): void {
    MuiTextField = components.TextField;
    MuiCheckbox = components.Checkbox;
    MuiTypography = components.Typography;
    MuiBox = components.Box;
    MuiMenuItem = components.MenuItem;
    MuiFormControlLabel = components.FormControlLabel;
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
        array: renderArrayContainer,
    };
    if (headlessResolver.literal !== undefined)
        resolver.literal = headlessResolver.literal;
    if (headlessResolver.union !== undefined)
        resolver.union = headlessResolver.union;
    if (headlessResolver.discriminatedUnion !== undefined)
        resolver.discriminatedUnion = headlessResolver.discriminatedUnion;
    if (headlessResolver.record !== undefined)
        resolver.record = headlessResolver.record;
    if (headlessResolver.file !== undefined)
        resolver.file = headlessResolver.file;
    if (headlessResolver.unknown !== undefined)
        resolver.unknown = headlessResolver.unknown;
    return resolver;
}

export const muiResolver: ComponentResolver = buildResolver();
