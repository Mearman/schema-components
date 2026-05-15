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
    StringConstraints,
    NumberConstraints,
    ArrayConstraints,
    ObjectConstraints,
    FileConstraints,
    Editability,
    FieldBase,
} from "./types.ts";
import { resolveEditability } from "./types.ts";
import { isObject } from "./guards.ts";

// Object/record guards are imported from core/guards.ts.
// Remaining helpers are walker-specific.

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
    if (visited.has(ref))
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    if (visited.size >= MAX_REF_DEPTH)
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };

    const resolved = dereference(ref, rootDocument);
    if (resolved === undefined)
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };

    // Recursively resolve if the target is also a $ref
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    return resolveRef(resolved, rootDocument, nextVisited);
}

function dereference(
    ref: string,
    root: Record<string, unknown>
): Record<string, unknown> | undefined {
    // $ref: "#" (empty fragment) refers to the root document per RFC 6901
    if (ref === "#") return root;

    // JSON Pointer: #/path/to/schema
    if (ref.startsWith("#/")) {
        const parts = ref.slice(2).split("/");
        // "#/" (empty JSON Pointer) also refers to the root document
        if (parts.length === 1 && parts[0] === "") return root;
        let current: unknown = root;

        for (const part of parts) {
            if (!isObject(current)) return undefined;
            // JSON Pointer: ~1 → /, ~0 → ~
            const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
            current = current[decoded];
        }

        return isObject(current) ? current : undefined;
    }

    // $anchor: #SomeName — scan document for matching $anchor
    if (ref.startsWith("#") && ref.length > 1) {
        const anchorName = ref.slice(1);
        const found = findAnchor(root, anchorName);
        if (found !== undefined) return found;
    }

    return undefined;
}

/**
 * Recursively scan a schema document for a `$anchor` matching the given name.
 * Returns the schema object containing the anchor, or undefined.
 */
function findAnchor(
    node: unknown,
    anchorName: string
): Record<string, unknown> | undefined {
    if (!isObject(node)) return undefined;
    if (node.$anchor === anchorName) return node;

    // Recurse into known sub-schema locations
    for (const value of Object.values(node)) {
        if (isObject(value)) {
            const found = findAnchor(value, anchorName);
            if (found !== undefined) return found;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findAnchor(item, anchorName);
                if (found !== undefined) return found;
            }
        }
    }

    return undefined;
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
// Constraint extraction — type-specific
// ---------------------------------------------------------------------------

function extractStringConstraints(
    schema: Record<string, unknown>
): StringConstraints {
    const c: StringConstraints = {};
    const minLength = getNumber(schema, "minLength");
    if (minLength !== undefined) c.minLength = minLength;
    const maxLength = getNumber(schema, "maxLength");
    if (maxLength !== undefined) c.maxLength = maxLength;
    const pattern = getString(schema, "pattern");
    if (pattern !== undefined) c.pattern = pattern;
    const format = getString(schema, "format");
    if (format !== undefined) c.format = format;
    const contentEncoding = getString(schema, "contentEncoding");
    if (contentEncoding !== undefined) c.contentEncoding = contentEncoding;
    const contentMediaType = getString(schema, "contentMediaType");
    if (contentMediaType !== undefined) c.contentMediaType = contentMediaType;
    return c;
}

function extractNumberConstraints(
    schema: Record<string, unknown>
): NumberConstraints {
    const c: NumberConstraints = {};
    const minimum = getNumber(schema, "minimum");
    if (minimum !== undefined) c.minimum = minimum;
    const maximum = getNumber(schema, "maximum");
    if (maximum !== undefined) c.maximum = maximum;
    const exclusiveMinimum = getNumber(schema, "exclusiveMinimum");
    if (exclusiveMinimum !== undefined) c.exclusiveMinimum = exclusiveMinimum;
    const exclusiveMaximum = getNumber(schema, "exclusiveMaximum");
    if (exclusiveMaximum !== undefined) c.exclusiveMaximum = exclusiveMaximum;
    const multipleOf = getNumber(schema, "multipleOf");
    if (multipleOf !== undefined) c.multipleOf = multipleOf;
    return c;
}

function extractArrayConstraints(
    schema: Record<string, unknown>
): ArrayConstraints {
    const c: ArrayConstraints = {};
    const minItems = getNumber(schema, "minItems");
    if (minItems !== undefined) c.minItems = minItems;
    const maxItems = getNumber(schema, "maxItems");
    if (maxItems !== undefined) c.maxItems = maxItems;
    if (schema.uniqueItems === true) c.uniqueItems = true;
    const contains = getObject(schema, "contains");
    if (contains !== undefined) c.contains = contains;
    const minContains = getNumber(schema, "minContains");
    if (minContains !== undefined) c.minContains = minContains;
    const maxContains = getNumber(schema, "maxContains");
    if (maxContains !== undefined) c.maxContains = maxContains;
    return c;
}

function extractObjectConstraints(
    schema: Record<string, unknown>
): ObjectConstraints {
    const c: ObjectConstraints = {};
    const minProperties = getNumber(schema, "minProperties");
    if (minProperties !== undefined) c.minProperties = minProperties;
    const maxProperties = getNumber(schema, "maxProperties");
    if (maxProperties !== undefined) c.maxProperties = maxProperties;
    return c;
}

function extractFileConstraints(
    schema: Record<string, unknown>
): FileConstraints {
    const c: FileConstraints = {};
    const contentMediaType = getString(schema, "contentMediaType");
    if (contentMediaType !== undefined) {
        c.mimeTypes = [contentMediaType];
    }
    return c;
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
    // Recursive $ref support: cache results by ref string.
    // When a cycle is detected (same ref encountered during its own
    // resolution), return the placeholder which will be filled in
    // after the outer resolution completes. This creates proper
    // object graph cycles that renderers follow based on data depth.
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

    return {
        ...buildBase(schema, ctx),
        type: "object",
        constraints: extractObjectConstraints(schema),
        fields,
        requiredFields,
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
    discriminated: Discriminated,
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
// Build a WalkedField with common properties
// ---------------------------------------------------------------------------

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
// Narrowing helpers
// ---------------------------------------------------------------------------

/**
 * Constraint keywords that apply only to specific types.
 * Used to strip inapplicable constraints when expanding type arrays.
 */
const STRING_CONSTRAINTS = new Set(["minLength", "maxLength", "pattern"]);
const NUMBER_CONSTRAINTS = new Set([
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
]);
const ARRAY_CONSTRAINTS = new Set([
    "minItems",
    "maxItems",
    "uniqueItems",
    "contains",
    "minContains",
    "maxContains",
]);
const OBJECT_CONSTRAINTS = new Set(["minProperties", "maxProperties"]);

/**
 * Return a copy of the schema with constraint keywords that don't apply
 * to the given type removed. Meta keywords (description, title, etc.)
 * and composition keywords are always preserved.
 */
function stripInapplicableConstraints(
    schema: Record<string, unknown>,
    targetType: string
): Record<string, unknown> {
    const applicable = new Set([
        ...STRING_CONSTRAINTS,
        ...NUMBER_CONSTRAINTS,
        ...ARRAY_CONSTRAINTS,
        ...OBJECT_CONSTRAINTS,
    ]);

    // Keep only constraints that apply to the target type
    let keepForType: Set<string>;
    switch (targetType) {
        case "string":
            keepForType = STRING_CONSTRAINTS;
            break;
        case "number":
        case "integer":
            keepForType = NUMBER_CONSTRAINTS;
            break;
        case "array":
            keepForType = ARRAY_CONSTRAINTS;
            break;
        case "object":
            keepForType = OBJECT_CONSTRAINTS;
            break;
        default:
            keepForType = new Set();
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
        if (applicable.has(key) && !keepForType.has(key)) {
            continue; // strip inapplicable constraint
        }
        result[key] = value;
    }
    return result;
}

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
