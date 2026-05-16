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
    WalkedField,
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
} from "./types.ts";
import { isObject } from "./guards.ts";
import { resolveRef, countDistinctRefs } from "./ref.ts";
import {
    mergeAllOf,
    normaliseAnyOf,
    detectDiscriminated,
    mergeRefSiblings,
    ANNOTATION_SIBLINGS,
} from "./merge.ts";
import {
    extractArrayConstraints,
    extractObjectConstraints,
    stripInapplicableConstraints,
} from "./constraints.ts";
import {
    getString,
    getArray,
    getObject,
    extractSchemaMetaFields,
    extractChildOverride,
    buildBase,
    buildStringField,
    buildNumberField,
    buildBooleanField,
    buildNullField,
    buildUnknownField,
    buildFileField,
    walkSubSchemaMap,
    walkDependentRequiredMap,
    withoutKeys,
    isPrimitive,
} from "./walkBuilders.ts";
import type { WalkOptions, WalkContext } from "./walkBuilders.ts";
import { emitDiagnostic, appendPointer } from "./diagnostics.ts";

// ---------------------------------------------------------------------------
// Boolean schema handling (true/false at sub-schema positions)
// ---------------------------------------------------------------------------

/**
 * Handle JSON Schema boolean values (Draft 06+).
 * - `true` → permissive (unknown, editable)
 * - `false` → never (cannot hold any value)
 */
function walkBooleanSchema(value: boolean): WalkedField {
    if (value) {
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }
    return {
        type: "never",
        editability: "presentation",
        meta: { rejected: true },
        constraints: {},
    };
}

/**
 * Walk a sub-schema that may be an object, a boolean, or neither.
 * Dispatches to walkNode (object), walkBooleanSchema (boolean),
 * or returns unknown with a diagnostic.
 */
function walkSubSchema(value: unknown, ctx: WalkContext): WalkedField {
    if (isObject(value)) {
        return walkNode(value, ctx);
    }
    if (typeof value === "boolean") {
        return walkBooleanSchema(value);
    }
    return {
        type: "unknown",
        editability: "editable",
        meta: {},
        constraints: {},
    };
}

// ---------------------------------------------------------------------------
// Walker entry point
// ---------------------------------------------------------------------------

export function walk(schema: unknown, options: WalkOptions = {}): WalkedField {
    const {
        componentMeta,
        rootMeta,
        fieldOverrides,
        rootDocument,
        diagnostics,
        externalResolver,
    } = options;

    if (typeof schema === "boolean") {
        return walkBooleanSchema(schema);
    }

    if (!isObject(schema)) {
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    // Detect external $ref before resolution attempt
    const topRef = typeof schema.$ref === "string" ? schema.$ref : undefined;
    if (topRef !== undefined && !topRef.startsWith("#")) {
        emitDiagnostic(diagnostics, {
            code: "external-ref",
            message: `External $ref not supported: ${topRef}`,
            pointer: "",
            detail: { ref: topRef },
        });
    }

    // Resolve $ref if present
    const doc = rootDocument ?? schema;
    const maxRefDepth = countDistinctRefs(doc);
    const resolved = resolveRef(
        schema,
        doc,
        new Set(),
        diagnostics,
        maxRefDepth,
        externalResolver
    );

    return walkNode(resolved, {
        componentMeta,
        rootMeta,
        fieldOverrides,
        rootDocument: doc,
        isNullable: false,
        isOptional: false,
        defaultValue: undefined,
        refResults: new Map(),
        pointer: "",
        diagnostics,
        maxRefDepth,
        externalResolver,
    });
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

        // Collect annotation siblings from the referencing node
        // before resolving. These override the resolved target's
        // annotations per Draft 2020-12.
        const hasSiblings = [...ANNOTATION_SIBLINGS].some((k) => k in schema);

        const resolved = resolveRef(
            schema,
            ctx.rootDocument,
            new Set(),
            ctx.diagnostics,
            ctx.maxRefDepth,
            ctx.externalResolver
        );

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

        let result = walkNode(resolved, ctx);

        // Merge annotation siblings from the referencer over the
        // resolved target's meta. Different referencers can have
        // different annotations, so this is applied to the result
        // (not cached in the placeholder).
        if (hasSiblings) {
            result = {
                ...result,
                meta: mergeRefSiblings(schema, result.meta),
            };
        }

        Object.assign(placeholder, result);
        return placeholder;
    }

    // --- Handle if/then/else conditional ---
    const ifSchema = getObject(schema, "if");
    if (ifSchema !== undefined) {
        emitDiagnostic(ctx.diagnostics, {
            code: "conditional-fallback",
            message:
                "if/then/else rendered as base schema; conditionals require runtime evaluation",
            pointer: ctx.pointer,
        });
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
        emitDiagnostic(ctx.diagnostics, {
            code: "type-negation-fallback",
            message:
                "not schema rendered as negation; TypeScript cannot negate types",
            pointer: ctx.pointer,
        });
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
        if (!isPrimitive(schema.const)) {
            emitDiagnostic(ctx.diagnostics, {
                code: "invalid-const",
                message: `const value is not a primitive: ${typeof schema.const}`,
                pointer: ctx.pointer,
                detail: { constValue: schema.const },
            });
        }
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
        emitDiagnostic(ctx.diagnostics, {
            code: "unsupported-type",
            message:
                "Schema has no type, composition, enum, or const; rendering as unknown",
            pointer: ctx.pointer,
        });
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

    // --- Unknown type string ---
    emitDiagnostic(ctx.diagnostics, {
        code: "unsupported-type",
        message: `Unknown schema type: ${type}`,
        pointer: ctx.pointer,
        detail: { type },
    });

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

    const field = buildStringField(schema, ctx);

    // Walk contentSchema if present — describes the decoded form
    // when contentEncoding / contentMediaType are present.
    const contentSchema = getObject(schema, "contentSchema");
    if (contentSchema !== undefined) {
        field.meta.decodedSchema = walkNode(contentSchema, ctx);
    }

    return field;
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
            pointer: appendPointer(ctx.pointer, key),
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
        } else if (typeof propSchema === "boolean") {
            fields[key] = walkBooleanSchema(propSchema);
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
            ? walkSubSchemaMap(patternProps, walkNode, ctx)
            : undefined;

    // --- additionalProperties as boolean or schema ---
    let additionalPropertiesClosed: boolean | undefined;
    let additionalPropertiesSchema: WalkedField | undefined;
    const additionalProps = schema.additionalProperties;
    if (additionalProps === false) {
        additionalPropertiesClosed = true;
    } else if (additionalProps === true) {
        additionalPropertiesSchema = {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    } else if (isObject(additionalProps)) {
        additionalPropertiesSchema = walkNode(additionalProps, ctx);
    }

    // --- dependentSchemas ---
    const depSchemas = getObject(schema, "dependentSchemas");
    const walkedDepSchemas: Record<string, WalkedField> | undefined =
        depSchemas !== undefined
            ? walkSubSchemaMap(depSchemas, walkNode, ctx)
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
    } else if (unevalProps === true) {
        unevaluatedProperties = {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    } else if (isObject(unevalProps)) {
        unevaluatedProperties = walkNode(unevalProps, ctx);
    }

    // --- propertyNames ---
    const propertyNamesSchema = getObject(schema, "propertyNames");
    const walkedPropertyNames: WalkedField | undefined =
        propertyNamesSchema !== undefined
            ? walkNode(propertyNamesSchema, ctx)
            : undefined;

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
        ...(walkedPropertyNames !== undefined
            ? { propertyNames: walkedPropertyNames }
            : {}),
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
    // prefixItems -> tuple type (Draft 2020-12)
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

    // --- unevaluatedItems ---
    const unevaluatedItemsSchema = getObject(schema, "unevaluatedItems");
    const walkedUnevaluatedItems: WalkedField | undefined =
        unevaluatedItemsSchema !== undefined
            ? walkNode(unevaluatedItemsSchema, ctx)
            : undefined;

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
            ...(walkedUnevaluatedItems !== undefined
                ? { unevaluatedItems: walkedUnevaluatedItems }
                : {}),
        };
    }

    return {
        ...buildBase(schema, ctx),
        type: "array",
        constraints: extractArrayConstraints(schema),
        ...(walkedUnevaluatedItems !== undefined
            ? { unevaluatedItems: walkedUnevaluatedItems }
            : {}),
    };
}

function walkUnion(options: unknown[], ctx: WalkContext): UnionField {
    const walkedOptions = options.map((opt) => walkSubSchema(opt, ctx));
    return {
        ...buildBase({}, ctx),
        type: "union",
        constraints: {},
        options: walkedOptions,
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
