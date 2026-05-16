/**
 * Walker building blocks — helpers, meta extraction, field builders.
 *
 * Extracted from walker.ts to keep the core dispatch logic focused.
 * These functions have no dependency on the recursive walkNode function.
 */

import type {
    SchemaMeta,
    StringField,
    NumberField,
    BooleanField,
    NullField,
    FileField,
    UnknownField,
    WalkedField,
    Editability,
    FieldBase,
} from "./types.ts";
import { resolveEditability } from "./types.ts";
import { isObject } from "./guards.ts";
import {
    extractStringConstraints,
    extractNumberConstraints,
    extractFileConstraints,
} from "./constraints.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import type { ExternalResolver } from "./ref.ts";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function getString(
    obj: Record<string, unknown>,
    key: string
): string | undefined {
    const value = obj[key];
    return typeof value === "string" ? value : undefined;
}

export function getArray(
    obj: Record<string, unknown>,
    key: string
): unknown[] | undefined {
    const value = obj[key];
    return Array.isArray(value) ? value : undefined;
}

export function getObject(
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
    /** Diagnostics channel for surfacing silent fallbacks. */
    diagnostics?: DiagnosticsOptions;
    /** Sync resolver for external $ref URIs. */
    externalResolver?: ExternalResolver;
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

export function extractMetaFromJson(
    schema: Record<string, unknown>
): SchemaMeta {
    const meta: SchemaMeta = {};

    for (const [key, value] of Object.entries(schema)) {
        if (META_KEYWORDS.has(key)) {
            meta[key] = value;
        }
    }

    return meta;
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
    "visible",
    "order",
]);

export function extractSchemaMetaFields(
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

export function extractChildOverride(
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
// Walk context — shared state for the recursive walk
// ---------------------------------------------------------------------------

export interface WalkContext {
    componentMeta: SchemaMeta | undefined;
    rootMeta: SchemaMeta | undefined;
    fieldOverrides: Record<string, unknown> | undefined;
    rootDocument: Record<string, unknown>;
    isNullable: boolean;
    isOptional: boolean;
    defaultValue: unknown;
    /** Cache of $ref → WalkedField for recursive schema support. */
    refResults: Map<string, WalkedField>;
    /** JSON Pointer tracking for diagnostics. */
    pointer: string;
    /** Diagnostics channel for surfacing silent fallbacks. */
    diagnostics: DiagnosticsOptions | undefined;
    /** Derived $ref depth bound from the root document. */
    maxRefDepth: number;
    /** Sync resolver for external $ref URIs. */
    externalResolver: ExternalResolver | undefined;
}

// ---------------------------------------------------------------------------
// Field construction — produces discriminated WalkedField variants
// ---------------------------------------------------------------------------

/**
 * Build the common base shared by every field variant.
 */
export function buildBase(
    schema: Record<string, unknown>,
    ctx: WalkContext
): FieldBase & { editability: Editability } {
    const propertyMeta = extractMetaFromJson(schema);
    const overrideMeta = extractSchemaMetaFields(ctx.fieldOverrides);
    const mergedMeta: SchemaMeta = { ...propertyMeta, ...overrideMeta };

    const defaultValue = "default" in schema ? schema.default : undefined;

    const examplesRaw = schema.examples;
    const examples: unknown[] | undefined = Array.isArray(examplesRaw)
        ? examplesRaw
        : undefined;

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

    // Mutate ctx to suppress component meta for subtree when overrides present
    if (hasExplicitOverride && ctx.componentMeta !== undefined) {
        ctx = { ...ctx, componentMeta: undefined };
    }

    return {
        editability,
        meta: mergedMeta,
        isOptional: ctx.isOptional,
        isNullable: ctx.isNullable,
        defaultValue: defaultValue ?? ctx.defaultValue,
        ...(examples !== undefined ? { examples } : {}),
    };
}

export function buildStringField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): StringField {
    return {
        ...buildBase(schema, ctx),
        type: "string",
        constraints: extractStringConstraints(
            schema,
            ctx.diagnostics,
            ctx.pointer
        ),
    };
}

export function buildNumberField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): NumberField {
    return {
        ...buildBase(schema, ctx),
        type: "number",
        constraints: extractNumberConstraints(schema),
    };
}

export function buildBooleanField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): BooleanField {
    return {
        ...buildBase(schema, ctx),
        type: "boolean",
        constraints: {},
    };
}

export function buildNullField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): NullField {
    return {
        ...buildBase(schema, ctx),
        type: "null",
        constraints: {},
    };
}

export function buildUnknownField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): UnknownField {
    return {
        ...buildBase(schema, ctx),
        type: "unknown",
        constraints: {},
    };
}

export function buildFileField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): FileField {
    return {
        ...buildBase(schema, ctx),
        type: "file",
        constraints: extractFileConstraints(schema),
    };
}

// ---------------------------------------------------------------------------
// Object sub-schema helpers
// ---------------------------------------------------------------------------

/** Walk a map of sub-schemas (patternProperties, dependentSchemas). */
export function walkSubSchemaMap<T>(
    map: Record<string, unknown>,
    walkNode: (schema: Record<string, unknown>, ctx: WalkContext) => T,
    ctx: WalkContext
): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(map)) {
        if (isObject(value)) {
            result[key] = walkNode(value, ctx);
        }
    }
    return result;
}

/** Walk a dependentRequired map (Record<string, string[]>). */
export function walkDependentRequiredMap(
    map: Record<string, unknown>
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(map)) {
        if (Array.isArray(value)) {
            result[key] = value.filter(
                (x): x is string => typeof x === "string"
            );
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Return a copy of the schema without the specified keys.
 * Used to strip composition keywords before walking the base schema.
 */
export function withoutKeys(
    schema: Record<string, unknown>,
    keys: string[]
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
        if (!keys.includes(key)) {
            result[key] = value;
        }
    }
    return result;
}

export function isPrimitive(
    value: unknown
): value is string | number | boolean | null {
    return (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
    );
}
