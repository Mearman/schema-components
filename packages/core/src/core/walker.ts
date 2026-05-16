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

import type {
    SchemaMeta,
    WalkedField,
    StringField,
    NumberField,
    BooleanField,
    NullField,
    EnumField,
    LiteralField,
    ObjectField,
    ArrayField,
    TupleField,
    RecordField,
    UnionField,
    DiscriminatedUnionField,
    ConditionalField,
    NegationField,
    FileField,
    UnknownField,
    Editability,
    FieldBase,
} from "./types.ts";
import { resolveEditability } from "./types.ts";
import { isObject } from "./guards.ts";
import { resolveRef } from "./ref.ts";
import { mergeAllOf, normaliseAnyOf, detectDiscriminated } from "./merge.ts";
import {
    extractStringConstraints,
    extractNumberConstraints,
    extractArrayConstraints,
    extractObjectConstraints,
    extractFileConstraints,
    stripInapplicableConstraints,
} from "./constraints.ts";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getString(
    obj: Record<string, unknown>,
    key: string
): string | undefined {
    const value = obj[key];
    return typeof value === "string" ? value : undefined;
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
        refResults: new Map(),
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
    /** Cache of $ref → WalkedField for recursive schema support.
     *  When a $ref is encountered during construction, a placeholder is
     *  stored here. If the same $ref is encountered again (cycle), the
     *  placeholder is returned. After construction, the placeholder is
     *  filled in via Object.assign, creating a proper object graph cycle
     *  that renderers follow based on data depth. */
    refResults: Map<string, WalkedField>;
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
    const ref = getString(schema, "$ref");
    if (ref !== undefined) {
        const cached = ctx.refResults.get(ref);
        if (cached !== undefined) return cached;

        const resolved = resolveRef(schema, ctx.rootDocument, new Set());

        // Placeholder is stored in the cache BEFORE recursing so that
        // re-encountering the same $ref returns it instead of recursing
        // infinitely. After walkNode completes, the placeholder is
        // filled in via Object.assign — any references to it in the
        // tree automatically see the updated properties.
        const placeholder: WalkedField = {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
        ctx.refResults.set(ref, placeholder);

        const result = walkNode(resolved, ctx);
        Object.assign(placeholder, result);
        return placeholder;
    }

    // --- Handle if/then/else conditional ---
    const ifSchema = getObject(schema, "if");
    if (ifSchema !== undefined) {
        const base = buildBase(
            withoutKeys(schema, ["if", "then", "else"]),
            ctx
        );
        const thenSchema = getObject(schema, "then");
        const elseSchema = getObject(schema, "else");
        const conditional: ConditionalField = {
            ...base,
            type: "conditional",
            constraints: {},
            ifClause: walkNode(ifSchema, ctx),
        };
        if (thenSchema !== undefined) {
            conditional.thenClause = walkNode(thenSchema, ctx);
        }
        if (elseSchema !== undefined) {
            conditional.elseClause = walkNode(elseSchema, ctx);
        }
        return conditional;
    }

    // --- Handle not (negation) ---
    const notSchema = getObject(schema, "not");
    if (notSchema !== undefined) {
        const base = buildBase(withoutKeys(schema, ["not"]), ctx);
        const negated: NegationField = {
            ...base,
            type: "negation",
            constraints: {},
            negated: walkNode(notSchema, ctx),
        };
        return negated;
    }

    // --- Handle enum ---
    const enumValues = getArray(schema, "enum");
    if (enumValues !== undefined) {
        return walkEnum(schema, enumValues, ctx);
    }

    // --- Handle const (literal) ---
    if ("const" in schema) {
        return walkLiteral(schema, ctx);
    }

    // --- Extract type ---
    const type = getString(schema, "type");
    const typeArray = getArray(schema, "type");

    // --- type as array (Draft 04–07): ["string", "null"] → anyOf ---
    if (type === undefined && typeArray !== undefined) {
        // Filter out "null" to detect nullable
        const nonNullTypes = typeArray.filter(
            (t): t is string => typeof t === "string" && t !== "null"
        );
        const hasNull = typeArray.includes("null");

        if (nonNullTypes.length === 0) {
            // Only null types
            return buildNullField(schema, ctx);
        }

        if (nonNullTypes.length === 1) {
            // Single non-null type + nullable → walk with nullable flag
            const walkCtx = hasNull ? { ...ctx, isNullable: true } : ctx;
            // Length check guarantees index 0 exists
            const singleType = nonNullTypes[0];
            if (singleType === undefined) {
                return buildUnknownField(schema, ctx);
            }
            return walkNode(
                {
                    ...stripInapplicableConstraints(schema, singleType),
                    type: singleType,
                },
                walkCtx
            );
        }

        // Multiple non-null types → union, each with only type-applicable constraints
        const options = nonNullTypes.map((t) => ({
            ...stripInapplicableConstraints(schema, t),
            type: t,
        }));
        if (hasNull) {
            return walkUnion([...options, { type: "null" }], {
                ...ctx,
                isNullable: true,
            });
        }
        return walkUnion(options, ctx);
    }

    // --- No type, no composition, no enum → unknown ---
    if (type === undefined) {
        return buildUnknownField(schema, ctx);
    }

    // --- Primitive types ---
    if (type === "string") return walkString(schema, ctx);
    if (type === "number" || type === "integer") return walkNumber(schema, ctx);
    if (type === "boolean") return walkBoolean(schema, ctx);
    if (type === "null") {
        return buildNullField(schema, ctx);
    }

    // --- Object / Record ---
    if (type === "object") {
        const properties = getObject(schema, "properties");
        if (properties !== undefined) {
            return walkObject(schema, properties, ctx);
        }
        // No properties — check for record (additionalProperties)
        const additionalProps = getObject(schema, "additionalProperties");
        if (additionalProps !== undefined) {
            return walkRecord(schema, additionalProps, ctx);
        }
        // Empty object schema
        return {
            ...buildBase(schema, ctx),
            type: "object",
            constraints: extractObjectConstraints(schema),
            fields: {},
            requiredFields: [],
        };
    }

    // --- Array ---
    if (type === "array") {
        return walkArray(schema, ctx);
    }

    return buildUnknownField(schema, ctx);
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
        return buildFileField(schema, ctx);
    }

    return buildStringField(schema, ctx);
}

function walkNumber(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    return buildNumberField(schema, ctx);
}

function walkBoolean(
    schema: Record<string, unknown>,
    ctx: WalkContext
): WalkedField {
    return buildBooleanField(schema, ctx);
}

function walkEnum(
    schema: Record<string, unknown>,
    enumValues: unknown[],
    ctx: WalkContext
): EnumField {
    return {
        ...buildBase(schema, ctx),
        type: "enum",
        constraints: {},
        enumValues: enumValues.filter(
            (v): v is string | number | boolean | null =>
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean" ||
                v === null
        ),
    };
}

function walkLiteral(
    schema: Record<string, unknown>,
    ctx: WalkContext
): LiteralField {
    const constValue = schema.const;
    const values = isPrimitive(constValue) ? [constValue] : [];
    return {
        ...buildBase(schema, ctx),
        type: "literal",
        constraints: {},
        literalValues: values,
    };
}

// ---------------------------------------------------------------------------
// Object sub-schema helpers
// ---------------------------------------------------------------------------

/** Walk a map of sub-schemas (patternProperties, dependentSchemas). */
function walkSubSchemaMap(
    map: Record<string, unknown>,
    ctx: WalkContext
): Record<string, WalkedField> {
    const result: Record<string, WalkedField> = {};
    for (const [key, value] of Object.entries(map)) {
        if (isObject(value)) {
            result[key] = walkNode(value, ctx);
        }
    }
    return result;
}

/** Walk a dependentRequired map (Record<string, string[]>). */
function walkDependentRequiredMap(
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

function walkObject(
    schema: Record<string, unknown>,
    properties: Record<string, unknown>,
    ctx: WalkContext
): ObjectField {
    const required = getArray(schema, "required");
    const requiredFields: string[] =
        required?.filter((r): r is string => typeof r === "string") ?? [];

    const fields: Record<string, WalkedField> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
        const childOverride = extractChildOverride(ctx.fieldOverrides, key);
        const isRequired = requiredFields.includes(key);

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

    // --- patternProperties ---
    const patternProps = getObject(schema, "patternProperties");
    const walkedPatternProps: Record<string, WalkedField> | undefined =
        patternProps !== undefined
            ? walkSubSchemaMap(patternProps, ctx)
            : undefined;

    // --- additionalProperties as boolean or schema ---
    let additionalPropertiesClosed: boolean | undefined;
    let additionalPropertiesSchema: WalkedField | undefined;
    const additionalProps = schema.additionalProperties;
    if (additionalProps === false) {
        additionalPropertiesClosed = true;
    } else if (isObject(additionalProps)) {
        additionalPropertiesSchema = walkNode(additionalProps, ctx);
    }

    // --- dependentSchemas ---
    const depSchemas = getObject(schema, "dependentSchemas");
    const walkedDepSchemas: Record<string, WalkedField> | undefined =
        depSchemas !== undefined
            ? walkSubSchemaMap(depSchemas, ctx)
            : undefined;

    // --- dependentRequired ---
    const depReq = getObject(schema, "dependentRequired");
    const walkedDepReq: Record<string, string[]> | undefined =
        depReq !== undefined ? walkDependentRequiredMap(depReq) : undefined;

    // --- unevaluatedProperties ---
    let unevaluatedProperties: WalkedField | undefined;
    let unevaluatedPropertiesClosed: boolean | undefined;
    const unevalProps = schema.unevaluatedProperties;
    if (unevalProps === false) {
        unevaluatedPropertiesClosed = true;
    } else if (isObject(unevalProps)) {
        unevaluatedProperties = walkNode(unevalProps, ctx);
    }

    return {
        ...buildBase(schema, ctx),
        type: "object",
        constraints: extractObjectConstraints(schema),
        fields,
        requiredFields,
        ...(walkedPatternProps !== undefined &&
        Object.keys(walkedPatternProps).length > 0
            ? { patternProperties: walkedPatternProps }
            : {}),
        ...(additionalPropertiesClosed ? { additionalPropertiesClosed } : {}),
        ...(additionalPropertiesSchema !== undefined
            ? { additionalPropertiesSchema }
            : {}),
        ...(walkedDepSchemas !== undefined &&
        Object.keys(walkedDepSchemas).length > 0
            ? { dependentSchemas: walkedDepSchemas }
            : {}),
        ...(walkedDepReq !== undefined && Object.keys(walkedDepReq).length > 0
            ? { dependentRequired: walkedDepReq }
            : {}),
        ...(unevaluatedProperties !== undefined
            ? { unevaluatedProperties }
            : {}),
        ...(unevaluatedPropertiesClosed ? { unevaluatedPropertiesClosed } : {}),
    };
}

function walkRecord(
    schema: Record<string, unknown>,
    valueSchema: Record<string, unknown>,
    ctx: WalkContext
): RecordField {
    const propertyNames = getObject(schema, "propertyNames");
    const keyType: WalkedField =
        propertyNames !== undefined
            ? walkNode(propertyNames, ctx)
            : {
                  type: "string",
                  editability: "editable",
                  meta: {},
                  constraints: {},
              };

    const valueType = walkNode(valueSchema, ctx);

    return {
        ...buildBase(schema, ctx),
        type: "record",
        constraints: extractObjectConstraints(schema),
        keyType,
        valueType,
    };
}

function walkArray(
    schema: Record<string, unknown>,
    ctx: WalkContext
): ArrayField | TupleField {
    // prefixItems → tuple type (Draft 2020-12)
    const prefixItems = getArray(schema, "prefixItems");
    if (prefixItems !== undefined) {
        const walkedItems = prefixItems
            .filter(isObject)
            .map((item) => walkNode(item, ctx));
        return {
            ...buildBase(schema, ctx),
            type: "tuple",
            constraints: extractArrayConstraints(schema),
            prefixItems: walkedItems,
        };
    }

    const items = getObject(schema, "items");
    if (items !== undefined) {
        const elementOverride = extractChildOverride(ctx.fieldOverrides, "[]");
        return {
            ...buildBase(schema, ctx),
            type: "array",
            constraints: extractArrayConstraints(schema),
            element: walkNode(items, {
                ...ctx,
                fieldOverrides: elementOverride,
            }),
        };
    }

    return {
        ...buildBase(schema, ctx),
        type: "array",
        constraints: extractArrayConstraints(schema),
    };
}

function walkUnion(options: unknown[], ctx: WalkContext): UnionField {
    const optionsArray = options.filter(isObject);
    return {
        ...buildBase({}, ctx),
        type: "union",
        constraints: {},
        options: optionsArray.map((opt) =>
            walkNode(opt, {
                ...ctx,
                fieldOverrides: undefined,
            })
        ),
    };
}

function walkDiscriminatedUnion(
    discriminated: {
        options: Record<string, unknown>[];
        discriminator: string;
    },
    ctx: WalkContext
): DiscriminatedUnionField {
    return {
        ...buildBase({}, ctx),
        type: "discriminatedUnion",
        constraints: {},
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
// Field construction — produces discriminated WalkedField variants
// ---------------------------------------------------------------------------

/**
 * Build the common base shared by every field variant.
 */
function buildBase(
    schema: Record<string, unknown>,
    ctx: WalkContext
): FieldBase & { editability: Editability } {
    const propertyMeta = extractMetaFromJson(schema);
    const overrideMeta = extractSchemaMetaFields(ctx.fieldOverrides);
    const mergedMeta: SchemaMeta = { ...propertyMeta, ...overrideMeta };

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
        editability,
        meta: mergedMeta,
        isOptional: ctx.isOptional,
        isNullable: ctx.isNullable,
        defaultValue: defaultValue ?? ctx.defaultValue,
    };
}

function buildStringField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): StringField {
    return {
        ...buildBase(schema, ctx),
        type: "string",
        constraints: extractStringConstraints(schema),
    };
}

function buildNumberField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): NumberField {
    return {
        ...buildBase(schema, ctx),
        type: "number",
        constraints: extractNumberConstraints(schema),
    };
}

function buildBooleanField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): BooleanField {
    return {
        ...buildBase(schema, ctx),
        type: "boolean",
        constraints: {},
    };
}

function buildNullField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): NullField {
    return {
        ...buildBase(schema, ctx),
        type: "null",
        constraints: {},
    };
}

function buildUnknownField(
    schema: Record<string, unknown>,
    ctx: WalkContext
): UnknownField {
    return {
        ...buildBase(schema, ctx),
        type: "unknown",
        constraints: {},
    };
}

function buildFileField(
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
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Return a copy of the schema without the specified keys.
 * Used to strip composition keywords before walking the base schema.
 */
function withoutKeys(
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
