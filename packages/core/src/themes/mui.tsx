/**
 * MUI (Material UI) theme adapter.
 *
 * Maps schema types to MUI components. Requires @mui/material to be
 * installed in the consuming project: schema-components does not bundle
 * the MUI runtime so consumers stay in control of versioning.
 *
 * Usage:
 *   import {
 *     createMuiResolver,
 *   } from "schema-components/themes/mui";
 *   import TextField from "@mui/material/TextField";
 *   import Checkbox from "@mui/material/Checkbox";
 *   import Typography from "@mui/material/Typography";
 *   import Box from "@mui/material/Box";
 *   import MenuItem from "@mui/material/MenuItem";
 *   import FormControlLabel from "@mui/material/FormControlLabel";
 *
 *   const muiResolver = createMuiResolver({
 *     TextField, Checkbox, Typography, Box, MenuItem, FormControlLabel,
 *   });
 *
 *   <SchemaProvider resolver={muiResolver}>...</SchemaProvider>
 *
 * Override individual types by spreading:
 *   const myResolver = { ...muiResolver, string: myStringRenderer };
 */

import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import { inputId, toReactNode } from "../react/headlessRenderers.tsx";
import { isObject } from "../core/guards.ts";
import { sortFieldsByOrder } from "../core/fieldOrder.ts";
import { isValidElement, type ElementType, type ReactNode } from "react";
import type { WalkedField } from "../core/types.ts";

// ---------------------------------------------------------------------------
// Dependency contract — element types supplied by the consumer
// ---------------------------------------------------------------------------

/**
 * Element types the MUI resolver renders into. Every slot is the MUI
 * component the corresponding render function expects to find at the
 * call site; consumers wire these in once via `createMuiResolver` so
 * the resolver can be used in SSR and multi-tenant contexts where two
 * callers might inject different element types.
 */
export interface MuiComponents {
    TextField: ElementType;
    Checkbox: ElementType;
    Typography: ElementType;
    Box: ElementType;
    MenuItem: ElementType;
    FormControlLabel: ElementType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ariaRequired(tree: WalkedField): { required: boolean } {
    return { required: tree.isOptional === false };
}

// ---------------------------------------------------------------------------
// Renderers — each accepts the dependency bag explicitly via closure
// ---------------------------------------------------------------------------

function makeRenderStringInput(
    components: MuiComponents
): (props: RenderProps) => ReactNode {
    const { TextField, Typography } = components;
    return function renderStringInput(props) {
        const strValue = typeof props.value === "string" ? props.value : "";
        const label =
            typeof props.meta.description === "string"
                ? props.meta.description
                : undefined;
        const id = inputId(props.path);

        if (props.readOnly) {
            return (
                <Typography id={id} variant="body2">
                    {strValue || "—"}
                </Typography>
            );
        }

        return (
            <TextField
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
    };
}

function makeRenderNumberInput(
    components: MuiComponents
): (props: RenderProps) => ReactNode {
    const { TextField, Typography } = components;
    return function renderNumberInput(props) {
        const label =
            typeof props.meta.description === "string"
                ? props.meta.description
                : undefined;
        const id = inputId(props.path);

        if (props.readOnly) {
            if (typeof props.value !== "number")
                return (
                    <Typography id={id} variant="body2">
                        {"—"}
                    </Typography>
                );
            return (
                <Typography id={id} variant="body2">
                    {props.value.toLocaleString()}
                </Typography>
            );
        }

        return (
            <TextField
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
    };
}

function makeRenderBooleanInput(
    components: MuiComponents
): (props: RenderProps) => ReactNode {
    const { Checkbox, Typography, FormControlLabel } = components;
    return function renderBooleanInput(props) {
        const label =
            typeof props.meta.description === "string"
                ? props.meta.description
                : undefined;
        const id = inputId(props.path);

        if (props.readOnly) {
            if (typeof props.value !== "boolean")
                return (
                    <Typography id={id} variant="body2">
                        {"—"}
                    </Typography>
                );
            return (
                <Typography id={id} variant="body2">
                    {props.value ? "Yes" : "No"}
                </Typography>
            );
        }

        return (
            <FormControlLabel
                control={
                    <Checkbox
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
    };
}

function makeRenderEnumInput(
    components: MuiComponents
): (props: RenderProps) => ReactNode {
    const { TextField, Typography, MenuItem } = components;
    return function renderEnumInput(props) {
        const enumValue = typeof props.value === "string" ? props.value : "";
        const label =
            typeof props.meta.description === "string"
                ? props.meta.description
                : undefined;
        const id = inputId(props.path);

        if (props.readOnly) {
            return (
                <Typography id={id} variant="body2">
                    {enumValue || "—"}
                </Typography>
            );
        }

        return (
            <TextField
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
                <MenuItem value="">Select{"…"}</MenuItem>
                {(props.tree.type === "enum" ? props.tree.enumValues : []).map(
                    (v) => (
                        <MenuItem key={v} value={v}>
                            {v}
                        </MenuItem>
                    )
                )}
            </TextField>
        );
    };
}

function makeRenderObjectContainer(
    components: MuiComponents
): (props: RenderProps) => ReactNode {
    const { Box, Typography } = components;
    return function renderObjectContainer(props) {
        if (props.tree.type !== "object") return null;
        const fields = props.tree.fields;

        const obj = isObject(props.value) ? props.value : {};

        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {typeof props.meta.description === "string" && (
                    <Typography variant="h6">
                        {props.meta.description}
                    </Typography>
                )}
                {sortFieldsByOrder(fields).map(([key, field]) => {
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
            </Box>
        );
    };
}

function makeRenderArrayContainer(
    components: MuiComponents
): (props: RenderProps) => ReactNode {
    const { Box } = components;
    return function renderArrayContainer(props) {
        const arr = Array.isArray(props.value) ? props.value : [];
        if (props.tree.type !== "array") return null;
        const element = props.tree.element;
        if (element === undefined) return null;

        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
            </Box>
        );
    };
}

// ---------------------------------------------------------------------------
// Default-stub components — used by the convenience `muiResolver` export
// ---------------------------------------------------------------------------

/**
 * The default `muiResolver` export below is built against these plain
 * HTML stubs so consumers can pull `muiResolver` into a story or test
 * without first wiring up `@mui/material`. Production usage should call
 * `createMuiResolver(...)` directly with the real MUI element types.
 */
function stripChildren(
    props: Record<string, unknown>
): Record<string, unknown> {
    const rest = { ...props };
    if ("children" in rest) {
        delete rest.children;
    }
    return rest;
}

const STUB_COMPONENTS: MuiComponents = {
    TextField: (props: Record<string, unknown>) => (
        <input {...stripChildren(props)} />
    ),
    Checkbox: (props: Record<string, unknown>) => (
        <input type="checkbox" {...stripChildren(props)} />
    ),
    Typography: (props: Record<string, unknown>) => <span {...props} />,
    Box: (props: Record<string, unknown>) => <div {...props} />,
    MenuItem: (props: Record<string, unknown>) => <option {...props} />,
    FormControlLabel: (props: Record<string, unknown>) => {
        const { control, label, ...rest } = props;
        return (
            <label {...rest}>
                {isValidElement(control) ? control : null}
                {typeof label === "string" ? label : null}
            </label>
        );
    },
};

// ---------------------------------------------------------------------------
// Factory + exported resolver
// ---------------------------------------------------------------------------

/**
 * Build a MUI-flavoured {@link ComponentResolver} bound to the supplied
 * element types. Each render function captures the supplied components
 * in a closure so two consumers can build different resolvers from the
 * same package without leaking element types through module-level
 * mutable state — making the adapter safe to use in SSR and multi-tenant
 * environments.
 *
 * Returns only the keys this theme actually overrides. The runtime
 * `mergeResolvers` call inside `<SchemaComponent>` / `<SchemaView>`
 * fills any unset keys from `headlessResolver`, so consumers never see
 * an unhandled field type even though this resolver leaves variants
 * like `union`, `discriminatedUnion`, `record`, `file`, and `unknown`
 * unset on purpose.
 *
 * @group Themes
 */
export function createMuiResolver(
    components: MuiComponents
): ComponentResolver {
    return {
        string: makeRenderStringInput(components),
        number: makeRenderNumberInput(components),
        boolean: makeRenderBooleanInput(components),
        enum: makeRenderEnumInput(components),
        object: makeRenderObjectContainer(components),
        array: makeRenderArrayContainer(components),
    };
}

/**
 * Component resolver mapping schema field types to MUI (Material UI)
 * primitives — `TextField`, `Checkbox`, `Typography`, etc.
 *
 * This default export is built against minimal HTML stubs so it is
 * usable without wiring up `@mui/material` first — handy for tests,
 * stories, and tree-shaken bundles that want the resolver shape
 * without the runtime dependency. For production usage call
 * {@link createMuiResolver} with the real MUI element types.
 *
 * @group Themes
 * @example
 * ```tsx
 * import TextField from "@mui/material/TextField";
 * import Checkbox from "@mui/material/Checkbox";
 * import Typography from "@mui/material/Typography";
 * import Box from "@mui/material/Box";
 * import MenuItem from "@mui/material/MenuItem";
 * import FormControlLabel from "@mui/material/FormControlLabel";
 * import { createMuiResolver } from "schema-components/themes/mui";
 *
 * const muiResolver = createMuiResolver({
 *   TextField, Checkbox, Typography, Box, MenuItem, FormControlLabel,
 * });
 *
 * <SchemaProvider resolver={muiResolver}>
 *   <SchemaComponent schema={userSchema} value={user} onChange={setUser} />
 * </SchemaProvider>
 * ```
 */
export const muiResolver: ComponentResolver =
    createMuiResolver(STUB_COMPONENTS);
