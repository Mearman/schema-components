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
    FieldOverrides,
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

/** Read a key from a JSON object, returning the value when it is a string and `undefined` otherwise. */
export function getString(
    obj: Record<string, unknown>,
    key: string
): string | undefined {
    const value = obj[key];
    return typeof value === "string" ? value : undefined;
}

/** Read a key from a JSON object, returning the value when it is an array and `undefined` otherwise. */
export function getArray(
    obj: Record<string, unknown>,
    key: string
): unknown[] | undefined {
    const value = obj[key];
    return Array.isArray(value) ? value : undefined;
}

/** Read a key from a JSON object, returning the value when it is a plain object and `undefined` otherwise. */
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

/**
 * Options accepted by `walk`. Use to inject meta overrides, field-level
 * overrides, the root document for cross-document `$ref` resolution, a
 * diagnostics sink, and an external `$ref` resolver.
 *
 * `WalkOptions` is generic in the schema's value type so callers that
 * walk a typed schema can carry `FieldOverrides<T>` through. The
 * default `T = unknown` preserves the loose runtime record shape for
 * existing non-generic callers — `Record<string, unknown>`.
 *
 * @group Walkers
 */
export interface WalkOptions<T = unknown> {
    componentMeta?: SchemaMeta | undefined;
    rootMeta?: SchemaMeta | undefined;
    /**
     * Nested field overrides — same shape as the schema.
     *
     * Typed against `FieldOverrides<T>` when a schema value type is
     * supplied; falls back to `Record<string, unknown>` for the
     * default `T = unknown` so the loose runtime shape continues to
     * compile.
     */
    fieldOverrides?: unknown extends T
        ? Record<string, unknown> | undefined
        : FieldOverrides<T> | undefined;
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

/**
 * Extract recognised meta keywords (`readOnly`, `writeOnly`,
 * `description`, `title`, `deprecated`, `default`, `component`,
 * `example`, `examples`) from a JSON Schema node into the `SchemaMeta`
 * shape consumed by the walker.
 */
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

/**
 * Project the meta-style keys (`readOnly`, `writeOnly`, `description`,
 * `title`, `deprecated`, `component`, `visible`, `order`) out of a
 * field override object into a `SchemaMeta`. Returns `undefined` when
 * the override has no meta fields so the walker can short-circuit.
 */
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

/**
 * Pluck the nested override at `key` from a parent field override map.
 * Returns `undefined` when no override is present or when the entry is
 * not a non-array object.
 */
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

/**
 * Mutable context threaded through every recursive walk step. Carries
 * the merged metadata, field overrides, document root, nullability /
 * optionality flags, `$ref` cache, diagnostics sink, and per-document
 * `$ref` depth bound that `walkBuilders` and the walker itself share.
 *
 * @group Walkers
 */
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

    return {
        editability,
        meta: mergedMeta,
        isOptional: ctx.isOptional,
        isNullable: ctx.isNullable,
        defaultValue: defaultValue ?? ctx.defaultValue,
        ...(examples !== undefined ? { examples } : {}),
    };
}

/** Build a walked `StringField` from a JSON Schema node. */
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

/** Build a walked `NumberField` from a JSON Schema node. */
export function buildNumberField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): NumberField {
    // `type: "integer"` is preserved as a structural flag — renderers
    // need to distinguish whole-number fields so `inputmode="numeric"`
    // and `step="1"` can be wired up without re-reading the schema.
    const isInteger = schema.type === "integer";
    return {
        ...buildBase(schema, ctx),
        type: "number",
        constraints: extractNumberConstraints(schema),
        isInteger,
    };
}

/** Build a walked `BooleanField` from a JSON Schema node. */
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

/** Build a walked `NullField` from a JSON Schema node. */
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

/** Build a walked `UnknownField` (permissive open-shape) from a JSON Schema node. */
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

/** Build a walked `FileField` from a JSON Schema node carrying `contentMediaType`. */
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

/**
 * Walk a map of sub-schemas (patternProperties, dependentSchemas, $defs).
 *
 * The callback receives each value as `unknown` so the caller can route
 * boolean schemas (`true`/`false`, valid per Draft 06+) through the
 * walker's boolean dispatch alongside object schemas. Non-schema values
 * (numbers, strings, arrays, undefined) are silently skipped — they
 * cannot represent a JSON Schema and have no walk-time meaning.
 */
export function walkSubSchemaMap<T>(
    map: Record<string, unknown>,
    walkSubSchema: (schema: unknown, ctx: WalkContext) => T,
    ctx: WalkContext
): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(map)) {
        if (isObject(value) || typeof value === "boolean") {
            result[key] = walkSubSchema(value, ctx);
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

/**
 * Type guard for a JSON primitive: string, number, boolean, or null.
 * Used to short-circuit walk-time decisions about leaf values.
 */
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

/**
 * Convert any JSON-shaped value to a display string suitable for
 * form input attributes or text rendering.
 *
 * Centralises the conversion logic because `EnumField.enumValues` and
 * `LiteralField.literalValues` are typed as `unknown[]` (Draft 2020-12
 * permits any JSON value in `enum` / `const`). Renderers call this
 * helper instead of inlining their own narrowing — the alternative
 * `String(v)` on `unknown` trips `@typescript-eslint/no-base-to-string`.
 *
 * Inputs originate from parsed JSON (or runtime JSON-equivalents) so
 * they are always `null | boolean | number | string | object | array`.
 * Objects and arrays serialise via `JSON.stringify` so a discriminated
 * union with object const values still produces a stable display key.
 *
 * Throws on non-JSON-shaped values (function, symbol, bigint, undefined)
 * — their presence indicates the producer violated the JSON contract.
 */
export function displayJsonValue(value: unknown): string {
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    throw new TypeError(
        `displayJsonValue: value of type ${typeof value} is not a JSON-shaped value`
    );
}
