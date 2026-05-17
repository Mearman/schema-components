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
import { isPrototypePollutingKey } from "./uri.ts";

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
// allOf: unevaluated-keyword strictness selection
// ---------------------------------------------------------------------------

/**
 * Rank an `unevaluatedProperties`/`unevaluatedItems` value by how
 * restrictive it is. Higher is stricter. The ordering reflects
 * JSON Schema 2020-12 §11.2/§11.3 semantics:
 *
 *   false (forbid all extras)
 *     > schema-object (extras must match the schema)
 *     > true (extras explicitly permitted)
 *     > absent (extras implicitly permitted)
 *
 * Unknown shapes (numbers, arrays, strings) sort below absent — we
 * cannot reason about them, so do not let them override anything.
 */
function unevaluatedRank(value: unknown): number {
    if (value === false) return 3;
    if (isObject(value)) return 2;
    if (value === true) return 1;
    if (value === undefined) return 0;
    return -1;
}

/**
 * Pick the strictest `unevaluatedProperties` / `unevaluatedItems` across
 * a set of `allOf` branches (including the parent prepended as a
 * branch) and apply it to the merged node. `mergeAllOf` already collects
 * properties from every branch into the merged result; surfacing the
 * strictest unevaluated keyword closes the loop so the walker's object
 * builder sees the spec-correct value.
 *
 * The merged node is mutated in place — that is consistent with the
 * surrounding walker code, which treats the merge output as a fresh
 * working node.
 */
function applyStrictestUnevaluated(
    merged: Record<string, unknown>,
    branches: readonly unknown[]
): void {
    let strictestProps: unknown = merged.unevaluatedProperties;
    let strictestItems: unknown = merged.unevaluatedItems;
    for (const branch of branches) {
        if (!isObject(branch)) continue;
        if ("unevaluatedProperties" in branch) {
            const candidate = branch.unevaluatedProperties;
            if (unevaluatedRank(candidate) > unevaluatedRank(strictestProps)) {
                strictestProps = candidate;
            }
        }
        if ("unevaluatedItems" in branch) {
            const candidate = branch.unevaluatedItems;
            if (unevaluatedRank(candidate) > unevaluatedRank(strictestItems)) {
                strictestItems = candidate;
            }
        }
    }
    if (strictestProps !== undefined) {
        merged.unevaluatedProperties = strictestProps;
    }
    if (strictestItems !== undefined) {
        merged.unevaluatedItems = strictestItems;
    }
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
        // Include the parent's own keys (minus `allOf`) as the first
        // branch so `mergeAllOf`'s first-write-wins behaviour preserves
        // sibling constraints (`type`, `properties`, `required` and the
        // unevaluated keywords) instead of silently dropping them.
        const parentBranch = withoutKeys(schema, ["allOf"]);
        const branches: unknown[] = [parentBranch, ...allOf];
        const merged = mergeAllOf(branches, ctx.diagnostics, ctx.pointer);
        // `false` signals an unsatisfiable composite — a `false` branch
        // collapses the whole conjunction. Render as a never field, the
        // same shape a top-level `false` schema produces.
        if (merged === false) {
            return walkBooleanSchema(false);
        }
        // Per JSON Schema 2020-12 §11.2/§11.3, the unevaluated keywords
        // on a parent must consider properties (or array items) declared
        // in any sibling `allOf` branch as "evaluated". With every
        // branch's properties merged above, we now also need to pick the
        // strictest `unevaluatedProperties` / `unevaluatedItems` across
        // parent and branches — first-write-wins inside `mergeAllOf`
        // would pick whichever value appeared first, dropping a stricter
        // `false` from a later branch. Strictness order:
        //   false > schema-object > true > absent.
        applyStrictestUnevaluated(merged, branches);
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
        // `oneOf: [T, { type: "null" }]` carries the same intent as the
        // `anyOf` nullable form — recognise it so the inner schema walks
        // with `isNullable: true` instead of producing a noisy 2-option
        // union with a separate null branch.
        const nullable = normaliseAnyOf(oneOf);
        if (nullable !== undefined) {
            return walkNode(nullable.inner, {
                ...ctx,
                isNullable: true,
            });
        }
        const discriminated = detectDiscriminated(
            oneOf,
            ctx.diagnostics,
            ctx.pointer
        );
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
    // `if` accepts a boolean per Draft 06+. Detect via `in` so a boolean
    // value triggers the conditional branch — `getObject` would skip it.
    if ("if" in schema) {
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
        const conditional: ConditionalField = {
            ...base,
            type: "conditional",
            constraints: {},
            ifClause: walkSubSchema(schema.if, ctx),
        };
        if ("then" in schema) {
            conditional.thenClause = walkSubSchema(schema.then, ctx);
        }
        if ("else" in schema) {
            conditional.elseClause = walkSubSchema(schema.else, ctx);
        }
        return conditional;
    }

    // --- Handle not (negation) ---
    // `not` accepts a boolean per Draft 06+. Use `in` for the same reason
    // as `if` above so `not: false` and `not: true` route through
    // `walkSubSchema` rather than being silently dropped.
    if ("not" in schema) {
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
            negated: walkSubSchema(schema.not, ctx),
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
    const accepted: (string | number | boolean | null)[] = [];
    for (let i = 0; i < enumValues.length; i++) {
        const v = enumValues[i];
        if (isPrimitive(v)) {
            accepted.push(v);
            continue;
        }
        // Non-primitive enum values (objects, arrays, undefined) cannot
        // be represented in the EnumField. Surface the drop so callers
        // can fix the source schema rather than silently lose values.
        emitDiagnostic(ctx.diagnostics, {
            code: "enum-value-filtered",
            message: `enum value at index ${String(i)} is not a primitive (${
                v === undefined ? "undefined" : typeof v
            }); dropping the entry`,
            pointer: appendPointer(ctx.pointer, `enum/${String(i)}`),
            detail: { index: i, value: v },
        });
    }
    return {
        ...buildBase(schema, ctx),
        type: "enum",
        constraints: {},
        enumValues: accepted,
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
    const requiredFields: string[] = [];
    if (required !== undefined) {
        for (let i = 0; i < required.length; i++) {
            const r = required[i];
            if (typeof r === "string") {
                requiredFields.push(r);
                continue;
            }
            // `required` is defined as an array of property-name strings.
            // Non-string entries cannot identify a property; surface the
            // drop so callers can fix the source schema.
            emitDiagnostic(ctx.diagnostics, {
                code: "required-non-string",
                message: `required[${String(i)}] is not a string (${
                    r === null ? "null" : typeof r
                }); dropping the entry`,
                pointer: appendPointer(ctx.pointer, `required/${String(i)}`),
                detail: { index: i, value: r },
            });
        }
    }

    const fields: Record<string, WalkedField> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
        // Defence in depth: refuse to register `__proto__`, `constructor`,
        // or `prototype` as field names. Assigning into a fresh literal
        // `{}` already avoids mutating `Object.prototype` here, but any
        // downstream consumer that uses `fields` as a lookup target —
        // for example via `fields[key]` inside an adapter — would happily
        // surface a value sourced from the runtime prototype chain.
        if (isPrototypePollutingKey(key)) {
            emitDiagnostic(ctx.diagnostics, {
                code: "prototype-polluting-property",
                message: `Refusing to register prototype-polluting property name: ${key}`,
                pointer: appendPointer(ctx.pointer, key),
                detail: { propertyName: key },
            });
            continue;
        }
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
    // Each value may be a boolean schema (Draft 06+); route every entry
    // through `walkSubSchema` so booleans become `unknown`/`never` rather
    // than being silently dropped.
    const patternProps = getObject(schema, "patternProperties");
    const walkedPatternProps: Record<string, WalkedField> | undefined =
        patternProps !== undefined
            ? walkSubSchemaMap(patternProps, walkSubSchema, ctx)
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
    // Boolean entries are valid per Draft 06+; route through
    // `walkSubSchema` so they are represented in the field tree.
    const depSchemas = getObject(schema, "dependentSchemas");
    const walkedDepSchemas: Record<string, WalkedField> | undefined =
        depSchemas !== undefined
            ? walkSubSchemaMap(depSchemas, walkSubSchema, ctx)
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
    // Accepts a boolean per Draft 06+ (e.g. `{ propertyNames: true }` means
    // any property name is permitted). Route through `walkSubSchema` so
    // boolean schemas are handled rather than silently dropped.
    const walkedPropertyNames: WalkedField | undefined =
        "propertyNames" in schema
            ? walkSubSchema(schema.propertyNames, ctx)
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
    // `contains` may be a boolean schema (Draft 06+) or an object; route
    // through `walkSubSchema` so booleans surface as `unknown`/`never`
    // rather than being silently dropped.
    const walkedContains: WalkedField | undefined =
        "contains" in schema ? walkSubSchema(schema.contains, ctx) : undefined;

    // prefixItems -> tuple type (Draft 2020-12)
    const prefixItems = getArray(schema, "prefixItems");
    if (prefixItems !== undefined) {
        const walkedItems = prefixItems
            .filter(isObject)
            .map((item) => walkNode(item, ctx));
        // In Draft 2020-12, `items` alongside `prefixItems` describes
        // the rest element — applied to entries beyond the prefix length.
        const restSchema = getObject(schema, "items");
        const restItems: WalkedField | undefined =
            restSchema !== undefined ? walkNode(restSchema, ctx) : undefined;
        return {
            ...buildBase(schema, ctx),
            type: "tuple",
            constraints: extractArrayConstraints(schema),
            prefixItems: walkedItems,
            ...(restItems !== undefined ? { restItems } : {}),
            ...(walkedContains !== undefined
                ? { contains: walkedContains }
                : {}),
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
            ...(walkedContains !== undefined
                ? { contains: walkedContains }
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
        ...(walkedContains !== undefined ? { contains: walkedContains } : {}),
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
