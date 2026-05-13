/**
 * Zod 4 schema walker.
 *
 * Inspects `._zod.def` directly to produce a `WalkedField` tree.
 * No JSON Schema involved — the walker reads Zod's internal representation.
 * All narrowing uses type guards — no type assertions.
 */

import type {
    FieldConstraints,
    SchemaMeta,
    WalkedField,
    ZodSchema,
} from "./types.ts";
import { resolveEditability } from "./types.ts";

// ---------------------------------------------------------------------------
// Type guards and safe access
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function hasProperty(value: unknown, key: string): boolean {
    return isObject(value) && key in value;
}

function getProperty(value: unknown, key: string): unknown {
    if (!isObject(value)) return undefined;
    return value[key];
}

function isZod4Schema(value: unknown): value is ZodSchema {
    return hasProperty(value, "_zod");
}

function getDef(schema: unknown): Record<string, unknown> | undefined {
    const zod = getProperty(schema, "_zod");
    if (!isObject(zod)) return undefined;
    const def = getProperty(zod, "def");
    if (!isObject(def)) return undefined;
    return def;
}

function getType(def: Record<string, unknown>): string {
    const type = def.type;
    return typeof type === "string" ? type : "unknown";
}

// ---------------------------------------------------------------------------
// Meta extraction
// ---------------------------------------------------------------------------

function extractMeta(schema: unknown): SchemaMeta {
    if (!isObject(schema)) return {};

    const metaFn = getProperty(schema, "meta");
    if (isCallable(metaFn)) {
        const result: unknown = metaFn();
        if (isObject(result) && Object.keys(result).length > 0) {
            return spreadMeta(result);
        }
    }

    // Check for .readonly() wrapper
    const def = getDef(schema);
    if (def !== undefined && getType(def) === "readonly") {
        return { readOnly: true };
    }

    return {};
}

function spreadMeta(obj: Record<string, unknown>): SchemaMeta {
    const meta: SchemaMeta = {};
    for (const [key, value] of Object.entries(obj)) {
        meta[key] = value;
    }
    return meta;
}

// ---------------------------------------------------------------------------
// Constraint extraction from ._zod.bag
// ---------------------------------------------------------------------------

function extractConstraints(schema: unknown): FieldConstraints {
    const zod = getProperty(schema, "_zod");
    if (!isObject(zod)) return {};
    const bag = getProperty(zod, "bag");
    if (!isObject(bag)) return {};

    const result: FieldConstraints = {};

    const minimum = bag.minimum;
    if (typeof minimum === "number") result.minimum = minimum;

    const maximum = bag.maximum;
    if (typeof maximum === "number") result.maximum = maximum;

    const minLength = bag.minLength;
    if (typeof minLength === "number") result.minLength = minLength;

    const maxLength = bag.maxLength;
    if (typeof maxLength === "number") result.maxLength = maxLength;

    const format = bag.format;
    if (typeof format === "string") result.format = format;

    const pattern = bag.pattern;
    if (isObject(pattern) && typeof pattern.source === "string") {
        result.pattern = pattern.source;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Unwrap — peel off optional, nullable, default, readonly wrappers
// ---------------------------------------------------------------------------

interface Unwrapped {
    inner: unknown;
    isOptional: boolean;
    isNullable: boolean;
    defaultValue: unknown;
}

function unwrap(schema: unknown): Unwrapped {
    let current = schema;
    let isOptional = false;
    let isNullable = false;
    let defaultValue: unknown = undefined;

    for (let depth = 0; depth < 10; depth++) {
        const def = getDef(current);
        if (def === undefined) break;

        const type = getType(def);

        if (type === "optional") {
            isOptional = true;
            current = def.innerType;
            continue;
        }
        if (type === "nullable") {
            isNullable = true;
            current = def.innerType;
            continue;
        }
        if (type === "default") {
            defaultValue = def.defaultValue;
            current = def.innerType;
            continue;
        }
        if (type === "readonly") {
            current = def.innerType;
            continue;
        }

        break;
    }

    return { inner: current, isOptional, isNullable, defaultValue };
}

// ---------------------------------------------------------------------------
// Walk options
// ---------------------------------------------------------------------------

export interface WalkOptions {
    componentMeta?: SchemaMeta | undefined;
    rootMeta?: SchemaMeta | undefined;
    /** Nested field overrides — same shape as the schema. */
    fieldOverrides?: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

export function walk(schema: unknown, options: WalkOptions = {}): WalkedField {
    const { componentMeta, rootMeta, fieldOverrides } = options;

    if (!isZod4Schema(schema)) {
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    const unwrapped = unwrap(schema);
    const innerSchema = unwrapped.inner;

    if (!isZod4Schema(innerSchema)) {
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
            isOptional: unwrapped.isOptional,
            isNullable: unwrapped.isNullable,
            defaultValue: unwrapped.defaultValue,
        };
    }

    const def = getDef(innerSchema);
    if (def === undefined) {
        return {
            type: "unknown",
            editability: "editable",
            meta: {},
            constraints: {},
        };
    }

    const type = getType(def);
    const propertyMeta = extractMeta(schema);
    const constraints = extractConstraints(innerSchema);

    // Extract SchemaMeta fields from the current override level
    const overrideMeta = extractSchemaMetaFields(fieldOverrides);

    const editability = resolveEditability(
        { ...propertyMeta, ...overrideMeta },
        componentMeta,
        rootMeta
    );

    const schemaType = mapType(type, def);
    const base: WalkedField = {
        type: schemaType,
        editability,
        meta: propertyMeta,
        isOptional: unwrapped.isOptional,
        isNullable: unwrapped.isNullable,
        defaultValue: unwrapped.defaultValue,
        constraints,
    };

    // If this field explicitly overrides editability (readOnly/writeOnly
    // in the field override or schema meta), children should NOT inherit
    // the component-level default — the override controls the subtree.
    const hasExplicitOverride =
        (overrideMeta !== undefined &&
            ("readOnly" in overrideMeta || "writeOnly" in overrideMeta)) ||
        Boolean(propertyMeta.readOnly) ||
        Boolean(propertyMeta.writeOnly);
    const childComponentMeta = hasExplicitOverride ? undefined : componentMeta;

    // --- Object ---
    if (schemaType === "object") {
        const shape = def.shape;
        if (isObject(shape)) {
            const fields: Record<string, WalkedField> = {};
            for (const [key, fieldSchema] of Object.entries(shape)) {
                const childOverride = extractChildOverride(fieldOverrides, key);
                fields[key] = walk(fieldSchema, {
                    componentMeta: childComponentMeta,
                    rootMeta,
                    fieldOverrides: childOverride,
                });
            }
            return { ...base, fields };
        }
    }

    // --- Array ---
    if (schemaType === "array") {
        const element = def.element;
        const elementOverride = extractChildOverride(fieldOverrides, "[]");
        return {
            ...base,
            element: walk(element, {
                componentMeta: childComponentMeta,
                rootMeta,
                fieldOverrides: elementOverride,
            }),
        };
    }

    // --- Enum ---
    if (schemaType === "enum") {
        const entries = def.entries;
        if (isObject(entries)) {
            return {
                ...base,
                enumValues: Object.values(entries).filter(isString),
            };
        }
        return { ...base, enumValues: [] };
    }

    // --- Literal ---
    if (schemaType === "literal") {
        const values = def.values;
        if (Array.isArray(values)) {
            return { ...base, literalValues: values.filter(isPrimitive) };
        }
        return { ...base, literalValues: [] };
    }

    // --- Union / Discriminated Union ---
    if (schemaType === "union" || schemaType === "discriminatedUnion") {
        const options = def.options;
        const discriminator = def.discriminator;
        const optionsArray = Array.isArray(options) ? options : [];

        return {
            ...base,
            options: optionsArray.map((opt) =>
                walk(opt, { componentMeta, rootMeta, fieldOverrides })
            ),
            discriminator:
                typeof discriminator === "string" ? discriminator : undefined,
        };
    }

    // --- Record ---
    if (schemaType === "record") {
        const keyType = def.keyType;
        const valueType = def.valueType;
        return {
            ...base,
            keyType: walk(keyType, { componentMeta, rootMeta }),
            valueType: walk(valueType, { componentMeta, rootMeta }),
        };
    }

    // --- File ---
    if (schemaType === "file") {
        const checks = def.checks;
        if (Array.isArray(checks)) {
            const mimeTypes = checks
                .filter(
                    (c): c is Record<string, unknown> =>
                        isObject(c) && "mime" in c
                )
                .flatMap((c) => {
                    const mime = c.mime;
                    return Array.isArray(mime) ? mime.filter(isString) : [];
                });
            return {
                ...base,
                constraints: {
                    ...constraints,
                    mimeTypes: mimeTypes.length > 0 ? mimeTypes : undefined,
                },
            };
        }
    }

    return base;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

function mapType(
    zodType: string,
    def: Record<string, unknown>
): WalkedField["type"] {
    switch (zodType) {
        case "string":
            return "string";
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "null":
            return "null";
        case "enum":
            return "enum";
        case "literal":
            return "literal";
        case "object":
            return "object";
        case "array":
            return "array";
        case "record":
            return "record";
        case "union":
            if ("discriminator" in def) return "discriminatedUnion";
            return "union";
        case "file":
            return "file";
        default:
            return "unknown";
    }
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

function isString(value: unknown): value is string {
    return typeof value === "string";
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

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

// ---------------------------------------------------------------------------
// Field override helpers — consume nested structure directly
// ---------------------------------------------------------------------------

const META_KEYS = new Set([
    "readOnly",
    "writeOnly",
    "description",
    "title",
    "deprecated",
    "component",
]);

/**
 * Extract SchemaMeta fields from a field override object.
 * Only known meta keys are extracted; everything else is a child override.
 */
function extractSchemaMetaFields(
    overrides: Record<string, unknown> | undefined
): Partial<SchemaMeta> | undefined {
    if (overrides === undefined) return undefined;

    const meta: SchemaMeta = {};
    for (const key of Object.keys(overrides)) {
        if (META_KEYS.has(key)) {
            meta[key] = overrides[key];
        }
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Extract the child override for a specific key.
 * Returns the full override value for that key — the child walk()
 * call will separate meta fields from nested child overrides itself.
 */
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
