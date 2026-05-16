"use client";

/**
 * <SchemaComponent> — renders UI from Zod, JSON Schema, or OpenAPI schemas.
 *
 * Auto-detects the input format, normalises to JSON Schema via the adapter,
 * walks the JSON Schema tree, and delegates rendering to the
 * ComponentResolver (theme adapter). Falls back to headless HTML.
 *
 * The `fields` prop type is inferred from the `schema` prop:
 * - Zod schemas → FieldOverrides<z.infer<T>> (full autocomplete)
 * - JSON Schema `as const` → FieldOverrides<FromJSONSchema<T>> (full autocomplete)
 * - OpenAPI `as const` + `ref` → FieldOverrides<ResolveOpenAPIRef<T, Ref>>
 * - Runtime schemas → Record<string, FieldOverride> (no autocomplete)
 */

import { z } from "zod";
import {
    createContext,
    useContext,
    useCallback,
    useMemo,
    isValidElement,
    type ReactNode,
} from "react";
import { walk } from "../core/walker.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import { normaliseSchema } from "../core/adapter.ts";
import { getRenderFunction, mergeResolvers } from "../core/renderer.ts";
import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import type {
    FieldOverride,
    FieldOverrides,
    SchemaMeta,
    WalkedField,
} from "../core/types.ts";
import type {
    FromJSONSchema,
    PathOfType,
    ResolveOpenAPIRef,
} from "../core/typeInference.ts";
import { headlessResolver } from "./headless.tsx";
import { resolvePath, resolveValue, setNestedValue } from "./fieldPath.ts";
import { isObject, toRecordOrUndefined } from "../core/guards.ts";
import {
    SchemaNormalisationError,
    SchemaFieldError,
    SchemaRenderError,
} from "../core/errors.ts";

// ---------------------------------------------------------------------------
// Context — theme adapter and scoped widgets
// ---------------------------------------------------------------------------

const UserResolverContext = createContext<ComponentResolver | undefined>(
    undefined
);

/**
 * Widget map — maps component hints (from `.meta({ component })`) to render
 * functions. Scoped at three levels:
 *
 * 1. **Per-instance** — `widgets` prop on `<SchemaComponent>`
 * 2. **Context-scoped** — `widgets` prop on `<SchemaProvider>`
 * 3. **Global** — `registerWidget()` (app-wide defaults)
 *
 * Resolution order: instance → context → global → resolver → headless.
 */
export type WidgetMap = ReadonlyMap<string, (props: RenderProps) => unknown>;

const WidgetsContext = createContext<WidgetMap | undefined>(undefined);

export function SchemaProvider({
    resolver,
    widgets,
    children,
}: {
    resolver: ComponentResolver;
    /** Scoped widgets available to all SchemaComponents in this subtree. */
    widgets?: WidgetMap;
    children: ReactNode;
}) {
    return (
        <UserResolverContext.Provider value={resolver}>
            <WidgetsContext.Provider value={widgets}>
                {children}
            </WidgetsContext.Provider>
        </UserResolverContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Widget registry — custom renderers registered by .meta({ component }) hint
// ---------------------------------------------------------------------------

/** Global widget registry — app-wide defaults. */
const globalWidgets = new Map<string, (props: RenderProps) => unknown>();

/**
 * Register a widget globally. The widget is resolved when a schema field
 * has `.meta({ component: name })`.
 *
 * For scoped registration, use the `widgets` prop on `<SchemaComponent>`
 * or `<SchemaProvider>` instead.
 */
export function registerWidget(
    name: string,
    render: (props: RenderProps) => unknown
): void {
    globalWidgets.set(name, render);
}

// ---------------------------------------------------------------------------
// Generic props with type-safe fields dispatch
// ---------------------------------------------------------------------------

type InferFields<T, Ref extends string | undefined> = T extends z.ZodType
    ? FieldOverrides<z.infer<T>>
    : T extends { openapi: unknown }
      ? Ref extends string
          ? FieldOverrides<ResolveOpenAPIRef<T & Record<string, unknown>, Ref>>
          : Record<string, FieldOverride>
      : T extends object
        ? unknown extends FromJSONSchema<T>
            ? Record<string, FieldOverride>
            : FieldOverrides<FromJSONSchema<T>>
        : Record<string, FieldOverride>;

export interface SchemaComponentProps<
    T = unknown,
    Ref extends string | undefined = undefined,
> {
    /** Zod schema, JSON Schema object, or OpenAPI document. */
    schema: T;
    /** For OpenAPI: a ref string like "#/components/schemas/User" or "/users/post". */
    ref?: Ref;
    /** Current value to render. */
    value?: unknown;
    /** Called when the value changes (editable fields). */
    onChange?: (value: unknown) => void;
    /** Run schema.safeParse() on change and surface errors via onValidationError. */
    validate?: boolean;
    /** Called with the ZodError when validation fails. */
    onValidationError?: (error: unknown) => void;
    /** Called when schema normalisation or rendering fails. */
    onError?: (error: import("../core/errors.ts").SchemaError) => void;
    /** Per-field meta overrides — nested object mirroring schema shape. */
    fields?: InferFields<T, Ref>;
    /** Meta overrides applied to the root schema. */
    meta?: SchemaMeta;
    /** Convenience: sets readOnly on all fields. */
    readOnly?: boolean;
    /** Convenience: sets writeOnly on all fields. */
    writeOnly?: boolean;
    /** Convenience: sets description on the root. */
    description?: string;
    /** Instance-scoped widgets — override context and global widgets. */
    widgets?: WidgetMap;
}

// ---------------------------------------------------------------------------
// <SchemaComponent>
// ---------------------------------------------------------------------------

export function SchemaComponent<
    T = unknown,
    Ref extends string | undefined = undefined,
>({
    schema: schemaInput,
    ref: refInput,
    value,
    onChange,
    validate,
    onValidationError,
    onError,
    fields,
    meta: componentMeta,
    readOnly,
    writeOnly,
    description,
    widgets: instanceWidgets,
}: SchemaComponentProps<T, Ref>): ReactNode {
    const userResolver = useContext(UserResolverContext);
    const contextWidgets = useContext(WidgetsContext);

    const mergedMeta: SchemaMeta = useMemo(() => {
        const merged: SchemaMeta = { ...componentMeta };
        if (readOnly === true) merged.readOnly = true;
        if (writeOnly === true) merged.writeOnly = true;
        if (description !== undefined) merged.description = description;
        return merged;
    }, [componentMeta, readOnly, writeOnly, description]);

    // Normalise input → JSON Schema
    let jsonSchema: Record<string, unknown>;
    let zodSchema: unknown;
    let rootMeta: SchemaMeta | undefined;
    let rootDocument: Record<string, unknown>;
    try {
        const normalised = normaliseSchema(schemaInput, refInput);
        jsonSchema = normalised.jsonSchema;
        zodSchema = normalised.zodSchema;
        rootMeta = normalised.rootMeta;
        rootDocument = normalised.rootDocument;
    } catch (err: unknown) {
        const error = new SchemaNormalisationError(
            err instanceof Error ? err.message : "Failed to normalise schema",
            schemaInput,
            detectNormalisationKind(err)
        );
        if (onError !== undefined) {
            onError(error);
            return null;
        }
        throw error;
    }

    const handleChange = useCallback(
        (nextValue: unknown) => {
            if (validate) {
                const error = runValidation(zodSchema, jsonSchema, nextValue);
                if (error !== undefined) {
                    // Root-level error callback
                    onValidationError?.(error);
                    // Per-field error callbacks
                    dispatchFieldErrors(fields, error);
                }
            }
            onChange?.(nextValue);
        },
        [validate, zodSchema, jsonSchema, onChange, onValidationError, fields]
    );

    // Walk the JSON Schema tree
    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: fields,
        rootDocument,
    };

    const tree = walk(jsonSchema, walkOptions);

    const renderChild = (
        childTree: WalkedField,
        childValue: unknown,
        childOnChange: (v: unknown) => void
    ): ReactNode => {
        return renderField(
            childTree,
            childValue,
            childOnChange,
            userResolver,
            renderChild,
            instanceWidgets,
            contextWidgets
        );
    };

    const effectiveValue = value ?? tree.defaultValue;
    return renderField(
        tree,
        effectiveValue,
        handleChange,
        userResolver,
        renderChild,
        instanceWidgets,
        contextWidgets
    );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function runValidation(
    zodSchema: unknown,
    jsonSchema: Record<string, unknown>,
    value: unknown
): unknown {
    // Prefer original Zod schema for validation (most accurate)
    if (zodSchema !== undefined && isObject(zodSchema)) {
        const safeParseFn = zodSchema.safeParse;
        if (isCallable(safeParseFn)) {
            const result: unknown = safeParseFn(value);
            if (
                isObject(result) &&
                "success" in result &&
                result.success !== true
            ) {
                return result.error;
            }
            return undefined;
        }
    }

    // Fallback: convert JSON Schema to Zod for validation
    const parsed: unknown = z.fromJSONSchema(jsonSchema);
    if (isObject(parsed)) {
        const safeParseFn = parsed.safeParse;
        if (isCallable(safeParseFn)) {
            const result: unknown = safeParseFn(value);
            if (
                isObject(result) &&
                "success" in result &&
                result.success !== true
            ) {
                return result.error;
            }
        }
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Field rendering — delegates to resolver or headless fallback
// ---------------------------------------------------------------------------

export function renderField(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    userResolver: ComponentResolver | undefined,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void
    ) => ReactNode,
    instanceWidgets?: WidgetMap,
    contextWidgets?: WidgetMap
): ReactNode {
    // 0. Visibility check — hidden fields render nothing
    if (tree.meta.visible === false) return null;

    // 1. Check widget registry for .meta({ component }) hint
    //    Resolution order: instance → context → global
    const componentHint = tree.meta.component;
    if (typeof componentHint === "string") {
        const widget =
            instanceWidgets?.get(componentHint) ??
            contextWidgets?.get(componentHint) ??
            globalWidgets.get(componentHint);
        if (widget !== undefined) {
            const props = buildRenderProps(tree, value, onChange, renderChild);
            const result: unknown = widget(props);
            if (result !== undefined && result !== null) {
                if (isValidElement(result)) return result;
                if (typeof result === "string" || typeof result === "number")
                    return result;
                return null;
            }
        }
    }

    // 2. Build merged resolver: user overrides → headless fallback
    const resolver =
        userResolver !== undefined
            ? mergeResolvers(userResolver, headlessResolver)
            : headlessResolver;

    // 3. Look up the render function for this schema type
    const renderFn = getRenderFunction(tree.type, resolver);
    if (renderFn !== undefined) {
        let result: unknown;
        try {
            result = renderFn(
                buildRenderProps(tree, value, onChange, renderChild)
            );
        } catch (err: unknown) {
            throw new SchemaRenderError(
                err instanceof Error
                    ? err.message
                    : `Render function threw for type "${tree.type}"`,
                tree,
                tree.type,
                err
            );
        }
        // Resolver returned null — propagate (e.g. empty array suppressed
        // in read-only mode). Do NOT fall through to the final fallback.
        if (result === null || result === undefined) return null;
        if (isValidElement(result)) return result;
        if (typeof result === "string" || typeof result === "number")
            return result;
    }

    // 4. Final fallback for unhandled types
    if (value === undefined || value === null) return <span>—</span>;
    return (
        <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
    );
}

function buildRenderProps(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void,
    renderChild: (
        tree: WalkedField,
        value: unknown,
        onChange: (v: unknown) => void
    ) => ReactNode
): RenderProps {
    const props: RenderProps = {
        value,
        onChange,
        readOnly: tree.editability === "presentation",
        writeOnly: tree.editability === "input",
        meta: tree.meta,
        constraints: tree.constraints,
        path: "",
        tree,
        renderChild,
    };
    if (tree.type === "enum") props.enumValues = tree.enumValues;
    if (tree.type === "array" && tree.element !== undefined)
        props.element = tree.element;
    if (tree.type === "object") props.fields = tree.fields;
    if (tree.type === "union" || tree.type === "discriminatedUnion")
        props.options = tree.options;
    if (tree.type === "discriminatedUnion")
        props.discriminator = tree.discriminator;
    if (tree.type === "record") props.keyType = tree.keyType;
    if (tree.type === "record") props.valueType = tree.valueType;
    if (tree.type === "tuple") props.prefixItems = tree.prefixItems;
    if (tree.type === "conditional") props.ifClause = tree.ifClause;
    if (tree.type === "conditional" && tree.thenClause !== undefined)
        props.thenClause = tree.thenClause;
    if (tree.type === "conditional" && tree.elseClause !== undefined)
        props.elseClause = tree.elseClause;
    if (tree.type === "negation") props.negated = tree.negated;
    if (tree.type === "literal") props.literalValues = tree.literalValues;
    if (tree.examples !== undefined) props.examples = tree.examples;
    return props;
}

// mergeResolvers imported from core/renderer.ts

// ---------------------------------------------------------------------------
// <SchemaField> — renders a single field from a schema by path
// ---------------------------------------------------------------------------

/**
 * Infer the schema's output type for SchemaField path inference.
 */
type InferSchemaType<T> = T extends z.ZodType
    ? z.infer<T>
    : T extends object
      ? unknown extends FromJSONSchema<T>
          ? unknown
          : FromJSONSchema<T>
      : unknown;

export interface SchemaFieldProps<
    T = unknown,
    Ref extends string | undefined = undefined,
    P extends string =
        | PathOfType<InferSchemaType<T>>
        | (string extends PathOfType<InferSchemaType<T>> ? string : never),
> {
    /**
     * Dot-separated path to the field (e.g. "address.city").
     * When the schema is a Zod schema or typed `as const`, only valid
     * paths are accepted. Falls back to `string` for runtime schemas.
     */
    path: P;
    /** The schema to extract the field from. */
    schema: T;
    /** For OpenAPI: a ref string. */
    ref?: Ref;
    /** Current value of the field at the given path. */
    value?: unknown;
    /** Called with the updated root value when this field changes. */
    onChange?: (value: unknown) => void;
    /** Override meta for this specific field. */
    meta?: SchemaMeta;
    /** Run validation on change. */
    validate?: boolean;
    onValidationError?: (error: unknown) => void;
}

export function SchemaField<
    T = unknown,
    Ref extends string | undefined = undefined,
    P extends string = string,
>({
    path,
    schema: schemaInput,
    ref: refInput,
    value,
    onChange,
    meta: fieldMeta,
    validate,
    onValidationError,
}: SchemaFieldProps<T, Ref, P>): ReactNode {
    const userResolver = useContext(UserResolverContext);
    const contextWidgets = useContext(WidgetsContext);

    let jsonSchema: Record<string, unknown>;
    let zodSchema: unknown;
    let rootMeta: SchemaMeta | undefined;
    let rootDocument: Record<string, unknown>;
    try {
        const normalised = normaliseSchema(schemaInput, refInput);
        jsonSchema = normalised.jsonSchema;
        zodSchema = normalised.zodSchema;
        rootMeta = normalised.rootMeta;
        rootDocument = normalised.rootDocument;
    } catch (err: unknown) {
        const error = new SchemaNormalisationError(
            err instanceof Error ? err.message : "Failed to normalise schema",
            schemaInput,
            detectNormalisationKind(err)
        );
        throw error;
    }

    const walkOptions: WalkOptions = {
        componentMeta: fieldMeta,
        rootMeta,
        rootDocument,
    };

    const fullTree = walk(jsonSchema, walkOptions);
    const fieldTree = resolvePath(fullTree, path);
    if (fieldTree === undefined) {
        throw new SchemaFieldError(
            `Field not found: ${path}`,
            schemaInput,
            path
        );
    }

    const fieldValue = resolveValue(value, path);

    const handleChange = useCallback(
        (nextFieldValue: unknown) => {
            if (validate) {
                const newRootValue = setNestedValue(
                    value,
                    path,
                    nextFieldValue
                );
                const error = runValidation(
                    zodSchema,
                    jsonSchema,
                    newRootValue
                );
                if (error !== undefined) {
                    onValidationError?.(error);
                }
            }
            const newRootValue = setNestedValue(value, path, nextFieldValue);
            onChange?.(newRootValue);
        },
        [
            validate,
            zodSchema,
            jsonSchema,
            value,
            path,
            onChange,
            onValidationError,
        ]
    );

    const renderChild = (
        childTree: WalkedField,
        childValue: unknown,
        childOnChange: (v: unknown) => void
    ): ReactNode => {
        return renderField(
            childTree,
            childValue,
            childOnChange,
            userResolver,
            renderChild,
            undefined,
            contextWidgets
        );
    };

    return renderField(
        fieldTree,
        fieldValue,
        handleChange,
        userResolver,
        renderChild,
        undefined,
        contextWidgets
    );
}

// ---------------------------------------------------------------------------
// Per-field error dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch Zod errors to per-field onValidationError callbacks.
 * Walks the fields override tree and matches errors by path prefix.
 */
function dispatchFieldErrors(fields: unknown, error: unknown): void {
    if (fields === undefined || !isObject(error)) return;

    // Zod errors have issues[] with path[] arrays
    if (!("issues" in error)) return;
    const issues = error.issues;
    if (!Array.isArray(issues)) return;

    const overrides = toRecordOrUndefined(fields);
    if (overrides === undefined) return;

    for (const [key, override] of Object.entries(overrides)) {
        if (override === undefined || typeof override !== "object") continue;
        if (override === null) continue;

        // Check if the override has an onValidationError callback
        if (!("onValidationError" in override)) continue;
        const fieldCallback = override.onValidationError;
        if (typeof fieldCallback !== "function") continue;

        // Collect errors whose path starts with this key
        const fieldErrors = issues.filter((issue: unknown): boolean => {
            if (!isObject(issue)) return false;
            if (!("path" in issue)) return false;
            const path: unknown = issue.path;
            if (!Array.isArray(path)) return false;
            const firstSegment: unknown = path[0];
            return firstSegment === key;
        });

        if (fieldErrors.length > 0 && isFieldErrorCallback(fieldCallback)) {
            fieldCallback({ issues: fieldErrors });
        }
    }
}

function isFieldErrorCallback(
    value: unknown
): value is (error: { issues: unknown[] }) => void {
    return typeof value === "function";
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

// Narrowing helpers imported from core/guards.ts.
// isCallable is local — specific to the validation boundary.

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function detectNormalisationKind(
    err: unknown
): import("../core/errors.ts").SchemaNormalisationError["kind"] {
    if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes("Zod 3")) return "zod3-unsupported";
        if (msg.includes("Invalid Zod 4")) return "invalid-zod";
        if (msg.includes("OpenAPI ref not found")) return "openapi-missing-ref";
        if (msg.includes("OpenAPI")) return "openapi-invalid";
        if (msg.includes("JSON Schema")) return "invalid-json-schema";
    }
    return "unknown";
}
