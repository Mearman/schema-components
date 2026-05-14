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
import { headlessResolver, toReactNode } from "../react/headless.tsx";
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

    if (props.readOnly) {
        return (
            <MuiTypography variant="body2">
                {strValue || "\u2014"}
            </MuiTypography>
        );
    }

    return (
        <MuiTextField
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

    if (props.readOnly) {
        if (typeof props.value !== "number")
            return <MuiTypography variant="body2">{"\u2014"}</MuiTypography>;
        return (
            <MuiTypography variant="body2">
                {props.value.toLocaleString()}
            </MuiTypography>
        );
    }

    return (
        <MuiTextField
            label={label}
            type="number"
            value={typeof props.value === "number" ? props.value : ""}
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

    if (props.readOnly) {
        if (typeof props.value !== "boolean")
            return <MuiTypography variant="body2">{"\u2014"}</MuiTypography>;
        return (
            <MuiTypography variant="body2">
                {props.value ? "Yes" : "No"}
            </MuiTypography>
        );
    }

    return (
        <MuiFormControlLabel
            control={
                <MuiCheckbox
                    checked={props.value === true}
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

    if (props.readOnly) {
        return (
            <MuiTypography variant="body2">
                {enumValue || "\u2014"}
            </MuiTypography>
        );
    }

    return (
        <MuiTextField
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
            {(props.enumValues ?? []).map((v) => (
                <MuiMenuItem key={v} value={v}>
                    {v}
                </MuiMenuItem>
            ))}
        </MuiTextField>
    );
}

function renderObjectContainer(props: RenderProps): ReactNode {
    const fields = props.fields;
    if (fields === undefined) return null;

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
                            props.renderChild(field, childValue, childOnChange)
                        )}
                    </div>
                );
            })}
        </MuiBox>
    );
}

function renderArrayContainer(props: RenderProps): ReactNode {
    const arr = Array.isArray(props.value) ? props.value : [];
    const element = props.element;
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
                            props.renderChild(element, item, childOnChange)
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

let MuiTextField: React.ComponentType<Record<string, unknown>> = (props) => (
    <input {...stripChildren(props)} />
);
let MuiCheckbox: React.ComponentType<Record<string, unknown>> = (props) => (
    <input type="checkbox" {...stripChildren(props)} />
);
let MuiTypography: React.ComponentType<Record<string, unknown>> = (props) => (
    <span {...props} />
);
let MuiBox: React.ComponentType<Record<string, unknown>> = (props) => (
    <div {...props} />
);
let MuiMenuItem: React.ComponentType<Record<string, unknown>> = (props) => (
    <option {...props} />
);
let MuiFormControlLabel: React.ComponentType<Record<string, unknown>> = (
    props
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
    TextField: React.ComponentType<Record<string, unknown>>;
    Checkbox: React.ComponentType<Record<string, unknown>>;
    Typography: React.ComponentType<Record<string, unknown>>;
    Box: React.ComponentType<Record<string, unknown>>;
    MenuItem: React.ComponentType<Record<string, unknown>>;
    FormControlLabel: React.ComponentType<Record<string, unknown>>;
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
