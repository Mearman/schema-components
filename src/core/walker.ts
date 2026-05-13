/**
 * JSON Schema walker.
 *
 * Produces a `WalkedField` tree from a JSON Schema object. The walker
 * reads standard JSON Schema keywords (Draft 2020-12) — no Zod internals.
 * Handles $ref resolution, allOf merging, nullable detection from anyOf,
 * and discriminated union detection from oneOf + const.
 *
 * All narrowing uses type guards — no type assertions.
 */

import type { FieldConstraints, SchemaMeta, WalkedField } from "./types.ts";
import { resolveEditability } from "./types.ts";

// ---------------------------------------------------------------------------
// Type guards and safe access
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
    obj: Record<string, unknown>,
    key: string
): string | undefined {
    const value = obj[key];
    return typeof value === "string" ? value : undefined;
}

function getNumber(
    obj: Record<string, unknown>,
    key: string
): number | undefined {
    const value = obj[key];
    return typeof value === "number" ? value : undefined;
}

function getArray(
    obj: Record<string, unknown>,
    key: string
): unknown[] | undefined {
    const value = obj[key];
    return Array.isArray(value) ? value : undefined;
}

function getObject(
    obj: Record<string, unknown>,
    key: string
): Record<string, unknown> | undefined {
    const value = obj[key];
    return isObject(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// Walk options
// ---------------------------------------------------------------------------

export interface WalkOptions {
    componentMeta?: SchemaMeta | undefined;
    rootMeta?: SchemaMeta | undefined;
    /** Nested field overrides — same shape as the schema. */
    fieldOverrides?: Record<string, unknown> | undefined;
    /** The root document for $ref resolution. */
    rootDocument?: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

const MAX_REF_DEPTH = 10;

function resolveRef(
    schema: Record<string, unknown>,
    rootDocument: Record<string, unknown>,
    visited: Set<string>
): Record<string, unknown> {
    const ref = getString(schema, "$ref");
    if (ref === undefined) return schema;

    // Cycle detection
    if (visited.has(ref)) return { type: "unknown" };
    if (visited.size >= MAX_REF_DEPTH) return { type: "unknown" };

    const resolved = dereference(ref, rootDocument);
    if (resolved === undefined) return { type: "unknown" };

    // Recursively resolve if the target is also a $ref
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    return resolveRef(resolved, rootDocument, nextVisited);
}

function dereference(
    ref: string,
    root: Record<string, unknown>
): Record<string, unknown> | undefined {
    if (!ref.startsWith("#/")) return undefined;

    const parts = ref.slice(2).split("/");
    let current: unknown = root;

    for (const part of parts) {
        if (!isObject(current)) return undefined;
        // JSON Pointer: ~1 → /, ~0 → ~
        const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
        current = current[decoded];
    }

    return isObject(current) ? current : undefined;
}

// ---------------------------------------------------------------------------
// allOf merging
// ---------------------------------------------------------------------------

/**
 * Merge multiple JSON Schema objects from allOf into one.
 * Merges: properties, required, meta fields, and constraints.
 */
function mergeAllOf(schemas: unknown[]): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const entry of schemas) {
        if (!isObject(entry)) continue;

        // Merge properties
        const props = getObject(entry, "properties");
        if (props !== undefined) {
            for (const [key, value] of Object.entries(props)) {
                properties[key] = value;
            }
        }

        // Merge required
        const req = getArray(entry, "required");
        if (req !== undefined) {
            for (const r of req) {
                if (typeof r === "string" && !required.includes(r)) {
                    required.push(r);
                }
            }
        }

        // Merge meta and constraints directly onto the result
        for (const [key, value] of Object.entries(entry)) {
            if (
                key === "properties" ||
                key === "required" ||
                key === "allOf" ||
                key === "type"
            ) {
                continue;
            }
            // First write wins for meta/constraints
            if (!(key in merged)) {
                merged[key] = value;
            }
        }

        // Inherit type from first schema that has one
        if (!("type" in merged)) {
            const type = getString(entry, "type");
            if (type !== undefined) merged.type = type;
        }
    }

    if (Object.keys(properties).length > 0) {
        merged.properties = properties;
    }
    if (required.length > 0) {
        merged.required = required;
    }

    return merged;
}

// ---------------------------------------------------------------------------
// Nullable detection from anyOf
// ---------------------------------------------------------------------------

interface NormalisedAnyOf {
    inner: Record<string, unknown>;
    isNullable: boolean;
}

/**
 * Detect `anyOf: [T, { type: "null" }]` → nullable T.
 * Returns the non-null schema and a nullable flag.
 */
function normaliseAnyOf(options: unknown[]): NormalisedAnyOf | undefined {
    if (options.length !== 2) return undefined;

    let inner: Record<string, unknown> | undefined;
    let hasNull = false;

    for (const opt of options) {
        if (!isObject(opt)) return undefined;
        if (opt.type === "null") {
            hasNull = true;
        } else {
            inner = opt;
        }
    }

    if (!hasNull || inner === undefined) return undefined;
    return { inner, isNullable: true };
}

// ---------------------------------------------------------------------------
// Discriminated union detection from oneOf + const
// ---------------------------------------------------------------------------

interface Discriminated {
    options: Record<string, unknown>[];
    discriminator: string;
}

/**
 * Detect oneOf where every option is an object with a property
 * that has a `const` value → discriminated union.
 */
function detectDiscriminated(options: unknown[]): Discriminated | undefined {
    if (options.length === 0) return undefined;

    // All options must be objects with properties
    let discriminator: string | undefined;

    for (const opt of options) {
        if (!isObject(opt)) return undefined;

        const props = getObject(opt, "properties");
        if (props === undefined) return undefined;

        // Find a property with `const` in this option
        let foundKey: string | undefined;
        for (const [key, value] of Object.entries(props)) {
            if (isObject(value) && "const" in value) {
                foundKey = key;
                break;
            }
        }

        if (foundKey === undefined) return undefined;

        // All options must use the same discriminator key
        if (discriminator === undefined) {
            discriminator = foundKey;
        } else if (discriminator !== foundKey) {
            return undefined;
        }
    }

    if (discriminator === undefined) return undefined;

    return { options: options.filter(isObject), discriminator };
}

// ---------------------------------------------------------------------------
// Meta extraction from JSON Schema keywords
// ---------------------------------------------------------------------------

const META_KEYWORDS = new Set([
    "readOnly",
    "writeOnly",
    "description",
    "title",
    "deprecated",
    "default",
    "component",
    "example",
    "examples",
]);

function extractMetaFromJson(schema: Record<string, unknown>): SchemaMeta {
    const meta: SchemaMeta = {};

    for (const [key, value] of Object.entries(schema)) {
        if (META_KEYWORDS.has(key)) {
            meta[key] = value;
        }
    }

    return meta;
}

// ---------------------------------------------------------------------------
// Constraint extraction from JSON Schema keywords
// ---------------------------------------------------------------------------

function extractConstraintsFromJson(
    schema: Record<string, unknown>
): FieldConstraints {
    const constraints: FieldConstraints = {};

    const minLength = getNumber(schema, "minLength");
    if (minLength !== undefined) constraints.minLength = minLength;

    const maxLength = getNumber(schema, "maxLength");
    if (maxLength !== undefined) constraints.maxLength = maxLength;

    const minimum = getNumber(schema, "minimum");
    if (minimum !== undefined) constraints.minimum = minimum;

    const maximum = getNumber(schema, "maximum");
    if (maximum !== undefined) constraints.maximum = maximum;

    const pattern = getString(schema, "pattern");
    if (pattern !== undefined) constraints.pattern = pattern;

    const format = getString(schema, "format");
    if (format !== undefined) constraints.format = format;

    const minItems = getNumber(schema, "minItems");
    if (minItems !== undefined) constraints.minItems = minItems;

    const maxItems = getNumber(schema, "maxItems");
    if (maxItems !== undefined) constraints.maxItems = maxItems;

    // File: format "binary" or contentMediaType
    if (format === "binary") {
        const contentMediaType = getString(schema, "contentMediaType");
        if (contentMediaType !== undefined) {
            constraints.mimeTypes = [contentMediaType];
        }
    }

    return constraints;
}

// ---------------------------------------------------------------------------
// Field override helpers
// ---------------------------------------------------------------------------

const OVERRIDE_META_KEYS = new Set([
    "readOnly",
    "writeOnly",
    "description",
    "title",
    "deprecated",
    "component",
]);

function extractSchemaMetaFields(
    overrides: Record<string, unknown> | undefined
): SchemaMeta | undefined {
    if (overrides === undefined) return undefined;

    const meta: SchemaMeta = {};
    for (const key of Object.keys(overrides)) {
        if (OVERRIDE_META_KEYS.has(key)) {
            meta[key] = overrides[key];
        }
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
}

function extractChildOverride(
    overrides: Record<string, unknown> | undefined,
    key: string
): Record<string, unknown> | undefined {
    if (overrides === undefined) return undefined;

    const child = overrides[key];
    if (child === undefined || child === null) return undefined;
    if (typeof child !== "object" || Array.isArray(child)) return undefined;

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(child)) {
        result[k] = v;
    }

    return Object.keys(result).length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// Walker entry point
// ---------------------------------------------------------------------------

export function walk(schema: unknown, options: WalkOptions = {}): WalkedField {
    const { componentMeta, rootMeta, fieldOverrides, rootDocument } = options;

    if (!isObject(schema)) {
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    // Resolve $ref if present
    const doc = rootDocument ?? schema;
    const resolved = resolveRef(schema, doc, new Set());

    return walkNode(resolved, {
        componentMeta,
        rootMeta,
        fieldOverrides,
        rootDocument: doc,
        isNullable: false,
        isOptional: false,
        defaultValue: undefined,
    });
}

// ---------------------------------------------------------------------------
// Internal walk state
// ---------------------------------------------------------------------------

interface WalkContext {
    componentMeta: SchemaMeta | undefined;
    rootMeta: SchemaMeta | undefined;
    fieldOverrides: Record<string, unknown> | undefined;
    rootDocument: Record<string, unknown>;
    isNullable: boolean;
    isOptional: boolean;
    defaultValue: unknown;
}

// ---------------------------------------------------------------------------
// Core walker — recursive
// ---------------------------------------------------------------------------

function walkNode(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    // --- Handle allOf ---
    const allOf = getArray(schema, "allOf");
    if (allOf !== undefined && allOf.length > 0) {
        const merged = mergeAllOf(allOf);
        return walkNode(merged, ctx);
    }

    // --- Handle anyOf ---
    const anyOf = getArray(schema, "anyOf");
    if (anyOf !== undefined) {
        const nullable = normaliseAnyOf(anyOf);
        if (nullable !== undefined) {
            // anyOf [T, null] → nullable T
            return walkNode(nullable.inner, {
                ...ctx,
                isNullable: true,
            });
        }
        // General anyOf → union
        return walkUnion(anyOf, ctx);
    }

    // --- Handle oneOf ---
    const oneOf = getArray(schema, "oneOf");
    if (oneOf !== undefined) {
        const discriminated = detectDiscriminated(oneOf);
        if (discriminated !== undefined) {
            return walkDiscriminatedUnion(discriminated, ctx);
        }
        // Generic oneOf → union
        return walkUnion(oneOf, ctx);
    }

    // --- Handle $ref ---
    const resolved = resolveRef(schema, ctx.rootDocument, new Set());

    // --- Handle enum ---
    const enumValues = getArray(resolved, "enum");
    if (enumValues !== undefined) {
        return walkEnum(resolved, enumValues, ctx);
    }

    // --- Handle const (literal) ---
    if ("const" in resolved) {
        return walkLiteral(resolved, ctx);
    }

    // --- Extract type ---
    const type = getString(resolved, "type");

    // --- No type, no composition, no enum → unknown ---
    if (type === undefined) {
        return buildField(resolved, "unknown", ctx);
    }

    // --- Primitive types ---
    if (type === "string") return walkString(resolved, ctx);
    if (type === "number" || type === "integer")
        return walkNumber(resolved, ctx);
    if (type === "boolean") return walkBoolean(resolved, ctx);
    if (type === "null") {
        return buildField(resolved, "null", ctx);
    }

    // --- Object / Record ---
    if (type === "object") {
        const properties = getObject(resolved, "properties");
        if (properties !== undefined) {
            return walkObject(resolved, properties, ctx);
        }
        // No properties — check for record (additionalProperties)
        const additionalProps = getObject(resolved, "additionalProperties");
        if (additionalProps !== undefined) {
            return walkRecord(resolved, additionalProps, ctx);
        }
        // Empty object schema
        return buildField(resolved, "object", ctx);
    }

    // --- Array ---
    if (type === "array") {
        return walkArray(resolved, ctx);
    }

    return buildField(resolved, "unknown", ctx);
}

// ---------------------------------------------------------------------------
// Type-specific walkers
// ---------------------------------------------------------------------------

function walkString(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    // Detect file: format "binary"
    const format = getString(schema, "format");
    if (format === "binary") {
        return buildField(schema, "file", ctx);
    }

    return buildField(schema, "string", ctx);
}

function walkNumber(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    return buildField(schema, "number", ctx);
}

function walkBoolean(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    return buildField(schema, "boolean", ctx);
}

function walkEnum(
    schema: Record<string, unknown>,
    enumValues: unknown[],
    ctx: WalkContext
): WalkedField {
    return {
        ...buildField(schema, "enum", ctx),
        enumValues: enumValues.filter(
            (v): v is string => typeof v === "string"
        ),
    };
}

function walkLiteral(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    const constValue = schema.const;
    const values = isPrimitive(constValue) ? [constValue] : [];
    return {
        ...buildField(schema, "literal", ctx),
        literalValues: values,
    };
}

function walkObject(
    schema: Record<string, unknown>,
    properties: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    const base = buildField(schema, "object", ctx);
    const required = getArray(schema, "required");

    const fields: Record<string, WalkedField> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
        const childOverride = extractChildOverride(ctx.fieldOverrides, key);
        const isRequired = required?.includes(key) === true;

        const childCtx: WalkContext = {
            ...ctx,
            fieldOverrides: childOverride,
            isOptional: !isRequired,
        };

        // If this field explicitly overrides editability, suppress
        // component-level meta for its subtree
        const overrideMeta = extractSchemaMetaFields(childOverride);
        const hasExplicitOverride =
            overrideMeta !== undefined &&
            ("readOnly" in overrideMeta || "writeOnly" in overrideMeta);
        if (hasExplicitOverride) {
            childCtx.componentMeta = undefined;
        }

        if (isObject(propSchema)) {
            fields[key] = walkNode(propSchema, childCtx);
        } else {
            fields[key] = {
                type: "unknown",
                editability: "editable",
                meta: {},
                constraints: {},
            };
        }
    }

    return { ...base, fields };
}

function walkRecord(
    schema: Record<string, unknown>,
    valueSchema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    const base = buildField(schema, "record", ctx);

    // Key type: JSON Schema propertyNames
    const propertyNames = getObject(schema, "propertyNames");
    const keyType =
        propertyNames !== undefined
            ? walkNode(propertyNames, ctx)
            : {
                  type: "string" as const,
                  editability: "editable" as const,
                  meta: {},
                  constraints: {},
              };

    const valueType = walkNode(valueSchema, ctx);

    return { ...base, keyType, valueType };
}

function walkArray(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    const base = buildField(schema, "array", ctx);

    // items → element schema
    const items = getObject(schema, "items");
    if (items !== undefined) {
        const elementOverride = extractChildOverride(ctx.fieldOverrides, "[]");
        return {
            ...base,
            element: walkNode(items, {
                ...ctx,
                fieldOverrides: elementOverride,
            }),
        };
    }

    return base;
}

function walkUnion(options: unknown[], ctx: WalkContext): WalkedField {
    const optionsArray = options.filter(isObject);
    return {
        ...buildField({}, "union", ctx),
        options: optionsArray.map((opt) =>
            walkNode(opt, {
                ...ctx,
                fieldOverrides: undefined,
            })
        ),
    };
}

function walkDiscriminatedUnion(
    discriminated: Discriminated,
    ctx: WalkContext
): WalkedField {
    return {
        ...buildField({}, "discriminatedUnion", ctx),
        options: discriminated.options.map((opt) =>
            walkNode(opt, {
                ...ctx,
                fieldOverrides: undefined,
            })
        ),
        discriminator: discriminated.discriminator,
    };
}

// ---------------------------------------------------------------------------
// Build a WalkedField with common properties
// ---------------------------------------------------------------------------

function buildField(
    schema: Record<string, unknown>,
    type: WalkedField["type"],
    ctx: WalkContext
): WalkedField {
    const propertyMeta = extractMetaFromJson(schema);
    const overrideMeta = extractSchemaMetaFields(ctx.fieldOverrides);
    const mergedMeta: SchemaMeta = { ...propertyMeta, ...overrideMeta };

    // Default value from schema
    const defaultValue = "default" in schema ? schema.default : undefined;

    const editability = resolveEditability(
        mergedMeta,
        ctx.componentMeta,
        ctx.rootMeta
    );

    // If this field explicitly overrides editability, suppress
    // component-level meta for its subtree
    const hasExplicitOverride =
        (overrideMeta !== undefined &&
            ("readOnly" in overrideMeta || "writeOnly" in overrideMeta)) ||
        Boolean(propertyMeta.readOnly) ||
        Boolean(propertyMeta.writeOnly);
    if (hasExplicitOverride && ctx.componentMeta !== undefined) {
        ctx = { ...ctx, componentMeta: undefined };
    }

    return {
        type,
        editability,
        meta: mergedMeta,
        isOptional: ctx.isOptional,
        isNullable: ctx.isNullable,
        defaultValue: defaultValue ?? ctx.defaultValue,
        constraints: extractConstraintsFromJson(schema),
    };
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

function isPrimitive(
    value: unknown
): value is string | number | boolean | null {
    return (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
    );
}
