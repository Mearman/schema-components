/**
 * <SchemaComponent> — renders UI from Zod, JSON Schema, or OpenAPI schemas.
 *
 * Auto-detects the input format, normalises to Zod via the adapter,
 * walks the Zod schema tree, and delegates rendering to the
 * ComponentResolver (theme adapter). Falls back to headless HTML.
 */

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
import { getRenderFunction } from "../core/renderer.ts";
import type { ComponentResolver, RenderProps } from "../core/renderer.ts";
import type { SchemaMeta, WalkedField } from "../core/types.ts";
import { createHeadlessResolver } from "./headless.tsx";

// ---------------------------------------------------------------------------
// Context — theme adapter
// ---------------------------------------------------------------------------

/**
 * The user-supplied resolver from <SchemaProvider>. undefined means no
 * provider is present — the headless resolver will be used.
 */
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
// Props
// ---------------------------------------------------------------------------

export interface SchemaComponentProps {
    /** Zod schema, JSON Schema object, or OpenAPI document. */
    schema: unknown;
    /** For OpenAPI: a ref string like "#/components/schemas/User" or "/users/post". */
    ref?: string;
    /** Current value to render. */
    value?: unknown;
    /** Called when the value changes (editable fields). */
    onChange?: (value: unknown) => void;
    /** Run schema.safeParse() on change and surface errors via onValidationError. */
    validate?: boolean;
    /** Called with the ZodError when validation fails. */
    onValidationError?: (error: unknown) => void;
    /** Per-field meta overrides keyed by dot-separated path. */
    fields?: Record<string, Partial<SchemaMeta>>;
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

export function SchemaComponent({
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
}: SchemaComponentProps): ReactNode {
    const userResolver = useContext(UserResolverContext);

    // Merge component-level meta from convenience props
    const mergedMeta: SchemaMeta = useMemo(() => {
        const merged: SchemaMeta = { ...componentMeta };
        if (readOnly === true) merged.readOnly = true;
        if (writeOnly === true) merged.writeOnly = true;
        if (description !== undefined) merged.description = description;
        return merged;
    }, [componentMeta, readOnly, writeOnly, description]);

    // Validate on change
    const handleChange = useCallback(
        (nextValue: unknown) => {
            if (validate) {
                const normalised = normaliseSchema(schemaInput, refInput);
                const safeParseFn = getProperty(normalised.schema, "safeParse");
                if (isCallable(safeParseFn)) {
                    const result: unknown = safeParseFn(nextValue);
                    if (
                        isObject(result) &&
                        "success" in result &&
                        result.success !== true
                    ) {
                        onValidationError?.(getProperty(result, "error"));
                        return;
                    }
                }
            }
            onChange?.(nextValue);
        },
        [validate, schemaInput, refInput, onChange, onValidationError]
    );

    // Normalise input → Zod schema
    let zodSchema: Record<string, unknown>;
    let rootMeta: SchemaMeta | undefined;
    try {
        const normalised = normaliseSchema(schemaInput, refInput);
        zodSchema = normalised.schema;
        rootMeta = normalised.rootMeta;
    } catch {
        return <div>Unable to parse schema</div>;
    }

    // Walk the Zod schema tree
    const walkOptions: WalkOptions = {
        componentMeta: mergedMeta,
        rootMeta,
        fieldOverrides: fields,
    };

    const tree = walk(zodSchema, walkOptions);

    // Recursive rendering with resolver delegation
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
// Field rendering — delegates to resolver or headless fallback
// ---------------------------------------------------------------------------

function renderField(
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
            const props = buildRenderProps(tree, value, onChange);
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
    const headless = createHeadlessResolver(renderChild);
    const resolver =
        userResolver !== undefined
            ? mergeResolvers(userResolver, headless)
            : headless;

    // 3. Look up the render function for this schema type
    const renderFn = getRenderFunction(tree.type, resolver);
    if (renderFn !== undefined) {
        const result: unknown = renderFn(
            buildRenderProps(tree, value, onChange)
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
    onChange: (v: unknown) => void
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

function mergeResolvers(
    user: ComponentResolver,
    fallback: ComponentResolver
): ComponentResolver {
    const merged: ComponentResolver = {};
    const userStr = user.string ?? fallback.string;
    if (userStr !== undefined) merged.string = userStr;
    const userNum = user.number ?? fallback.number;
    if (userNum !== undefined) merged.number = userNum;
    const userBool = user.boolean ?? fallback.boolean;
    if (userBool !== undefined) merged.boolean = userBool;
    const userEnum = user.enum ?? fallback.enum;
    if (userEnum !== undefined) merged.enum = userEnum;
    const userObj = user.object ?? fallback.object;
    if (userObj !== undefined) merged.object = userObj;
    const userArr = user.array ?? fallback.array;
    if (userArr !== undefined) merged.array = userArr;
    const userRec = user.record ?? fallback.record;
    if (userRec !== undefined) merged.record = userRec;
    const userUnion = user.union ?? fallback.union;
    if (userUnion !== undefined) merged.union = userUnion;
    const userLit = user.literal ?? fallback.literal;
    if (userLit !== undefined) merged.literal = userLit;
    const userFile = user.file ?? fallback.file;
    if (userFile !== undefined) merged.file = userFile;
    const userUnk = user.unknown ?? fallback.unknown;
    if (userUnk !== undefined) merged.unknown = userUnk;
    return merged;
}

// ---------------------------------------------------------------------------
// <SchemaField> — renders a single field from a schema by path
// ---------------------------------------------------------------------------

export interface SchemaFieldProps {
    /** Dot-separated path to the field (e.g. "address.city"). */
    path: string;
    /** The schema to extract the field from. */
    schema: unknown;
    /** For OpenAPI: a ref string. */
    ref?: string;
    /** Current value of the entire schema object. */
    value?: unknown;
    /** Called with the updated value when this field changes. */
    onChange?: (value: unknown) => void;
    /** Override meta for this specific field. */
    meta?: SchemaMeta;
    /** Run validation on change. */
    validate?: boolean;
    onValidationError?: (error: unknown) => void;
}

export function SchemaField({
    path,
    schema: schemaInput,
    ref: refInput,
    value,
    onChange,
    meta: fieldMeta,
    validate,
    onValidationError,
}: SchemaFieldProps): ReactNode {
    const userResolver = useContext(UserResolverContext);

    // Normalise and walk the schema
    let zodSchema: Record<string, unknown>;
    let rootMeta: SchemaMeta | undefined;
    try {
        const normalised = normaliseSchema(schemaInput, refInput);
        zodSchema = normalised.schema;
        rootMeta = normalised.rootMeta;
    } catch {
        return <div>Unable to parse schema</div>;
    }

    const walkOptions: WalkOptions = {
        componentMeta: fieldMeta,
        rootMeta,
        path: "",
    };

    const fullTree = walk(zodSchema, walkOptions);
    const fieldTree = resolvePath(fullTree, path);
    if (fieldTree === undefined) {
        return <div>Field not found: {path}</div>;
    }

    // Extract the value at the given path
    const fieldValue = resolveValue(value, path);

    const handleChange = useCallback(
        (nextFieldValue: unknown) => {
            if (validate) {
                const safeParseFn = getProperty(zodSchema, "safeParse");
                if (isCallable(safeParseFn)) {
                    const newRootValue = setNestedValue(
                        value,
                        path,
                        nextFieldValue
                    );
                    const result: unknown = safeParseFn(newRootValue);
                    if (
                        isObject(result) &&
                        "success" in result &&
                        result.success !== true
                    ) {
                        onValidationError?.(getProperty(result, "error"));
                        return;
                    }
                }
            }
            const newRootValue = setNestedValue(value, path, nextFieldValue);
            onChange?.(newRootValue);
        },
        [validate, zodSchema, value, path, onChange, onValidationError]
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

        // Handle array indices: "items[0]" → descend into array, then index
        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        if (bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined) {
            const arrayField = bracketMatch[1];
            if (current.fields !== undefined) {
                current = current.fields[arrayField];
            }
            // Array element
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
            const existing = current[part];
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

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function toRecord(value: object): Record<string, unknown> {
    // TypeScript's `object` type has no index signature.
    // Iterating Object.entries builds the record without assertion.
    const record: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
        record[key] = val;
    }
    return record;
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

function getProperty(obj: Record<string, unknown>, key: string): unknown {
    return obj[key];
}
