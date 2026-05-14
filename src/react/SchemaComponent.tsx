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
import { walk, type WalkOptions } from "../core/walker.ts";
import { normaliseSchema } from "../core/adapter.ts";
import { getRenderFunction, mergeResolvers } from "../core/renderer.ts";
import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import type {
    FieldOverride,
    FieldOverrides,
    FromJSONSchema,
    PathOfType,
    ResolveOpenAPIRef,
    SchemaMeta,
    WalkedField,
} from "../core/types.ts";
import { headlessResolver } from "./headless.tsx";
import { isObject, toRecord } from "../core/guards.ts";

// ---------------------------------------------------------------------------
// Context — theme adapter
// ---------------------------------------------------------------------------

const UserResolverContext = createContext<ComponentResolver | undefined>(
    undefined
);

export function SchemaProvider({
    resolver,
    children,
}: {
    resolver: ComponentResolver;
    children: ReactNode;
}) {
    return (
        <UserResolverContext.Provider value={resolver}>
            {children}
        </UserResolverContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Widget registry — custom renderers registered by .meta({ component }) hint
// ---------------------------------------------------------------------------

const widgetRegistry = new Map<string, (props: RenderProps) => unknown>();

export function registerWidget(
    name: string,
    render: (props: RenderProps) => unknown
): void {
    widgetRegistry.set(name, render);
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
    fields,
    meta: componentMeta,
    readOnly,
    writeOnly,
    description,
}: SchemaComponentProps<T, Ref>): ReactNode {
    const userResolver = useContext(UserResolverContext);

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
    } catch {
        return <div>Unable to parse schema</div>;
    }

    const handleChange = useCallback(
        (nextValue: unknown) => {
            if (validate) {
                runValidation(
                    zodSchema,
                    jsonSchema,
                    nextValue,
                    onValidationError
                );
            }
            onChange?.(nextValue);
        },
        [validate, zodSchema, jsonSchema, onChange, onValidationError]
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
            renderChild
        );
    };

    return renderField(tree, value, handleChange, userResolver, renderChild);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function runValidation(
    zodSchema: unknown,
    jsonSchema: Record<string, unknown>,
    value: unknown,
    onError: ((error: unknown) => void) | undefined
): void {
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
                onError?.(result.error);
                return;
            }
            return;
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
                onError?.(result.error);
            }
        }
    }
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
    ) => ReactNode
): ReactNode {
    // 1. Check widget registry for .meta({ component }) hint
    const componentHint = tree.meta.component;
    if (typeof componentHint === "string") {
        const widget = widgetRegistry.get(componentHint);
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
        const result: unknown = renderFn(
            buildRenderProps(tree, value, onChange, renderChild)
        );
        if (result !== undefined && result !== null) {
            if (isValidElement(result)) return result;
            if (typeof result === "string" || typeof result === "number")
                return result;
        }
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
    if (tree.enumValues !== undefined) props.enumValues = tree.enumValues;
    if (tree.element !== undefined) props.element = tree.element;
    if (tree.fields !== undefined) props.fields = tree.fields;
    if (tree.options !== undefined) props.options = tree.options;
    if (tree.discriminator !== undefined)
        props.discriminator = tree.discriminator;
    if (tree.keyType !== undefined) props.keyType = tree.keyType;
    if (tree.valueType !== undefined) props.valueType = tree.valueType;
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
    } catch {
        return <div>Unable to parse schema</div>;
    }

    const walkOptions: WalkOptions = {
        componentMeta: fieldMeta,
        rootMeta,
        rootDocument,
    };

    const fullTree = walk(jsonSchema, walkOptions);
    const fieldTree = resolvePath(fullTree, path);
    if (fieldTree === undefined) {
        return <div>Field not found: {path}</div>;
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
                runValidation(
                    zodSchema,
                    jsonSchema,
                    newRootValue,
                    onValidationError
                );
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
            renderChild
        );
    };

    return renderField(
        fieldTree,
        fieldValue,
        handleChange,
        userResolver,
        renderChild
    );
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

function resolvePath(tree: WalkedField, path: string): WalkedField | undefined {
    if (path.length === 0) return tree;

    const parts = path.split(".");
    let current: WalkedField | undefined = tree;

    for (const part of parts) {
        if (current === undefined) return undefined;

        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        if (bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined) {
            const arrayField = bracketMatch[1];
            if (current.fields !== undefined) {
                current = current.fields[arrayField];
            }
            if (current?.element !== undefined) {
                current = current.element;
            }
            continue;
        }

        if (current.fields !== undefined) {
            current = current.fields[part];
        } else if (current.element !== undefined) {
            current = current.element;
        } else {
            return undefined;
        }
    }

    return current;
}

function resolveValue(root: unknown, path: string): unknown {
    if (path.length === 0) return root;

    const parts = path.split(".");
    let current: unknown = root;

    for (const part of parts) {
        if (typeof current !== "object" || current === null) return undefined;

        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        if (bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined) {
            const key = bracketMatch[1];
            const index = Number(bracketMatch[2]);
            const obj = toRecord(current);
            const arr = obj[key];
            if (Array.isArray(arr)) {
                current = arr[index];
            } else {
                return undefined;
            }
        } else {
            const obj = toRecord(current);
            current = obj[part];
        }
    }

    return current;
}

function setNestedValue(
    root: unknown,
    path: string,
    leafValue: unknown
): unknown {
    if (path.length === 0) return leafValue;

    const parts = path.split(".");
    const result = isObject(root) ? { ...toRecord(root) } : {};

    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === undefined) break;
        const isLast = i === parts.length - 1;

        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        if (bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined) {
            const key = bracketMatch[1];
            const index = Number(bracketMatch[2]);
            const existing: unknown = current[key];
            const arr: unknown[] = Array.isArray(existing)
                ? existing.slice()
                : [];
            if (isLast) {
                arr[index] = leafValue;
            }
            current[key] = arr;
            const nextCurrent = arr[index];
            if (nextCurrent !== undefined && isObject(nextCurrent)) {
                current = toRecord(nextCurrent);
            }
        } else if (isLast) {
            current[part] = leafValue;
        } else {
            const existing: unknown = current[part];
            const next = isObject(existing) ? { ...toRecord(existing) } : {};
            current[part] = next;
            current = next;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

// Narrowing helpers imported from core/guards.ts.
// isCallable is local — specific to the validation boundary.

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}
