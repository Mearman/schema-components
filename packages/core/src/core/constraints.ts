/**
 * Type-specific constraint extraction from JSON Schema keywords.
 *
 * Each extractor reads only the keywords relevant to its type,
 * producing the corresponding constraint map.
 */

import type {
    StringConstraints,
    NumberConstraints,
    ArrayConstraints,
    ObjectConstraints,
    FileConstraints,
} from "./types.ts";
import { isObject } from "./guards.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { emitDiagnostic } from "./diagnostics.ts";

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

function getNumber(
    obj: Record<string, unknown>,
    key: string
): number | undefined {
    const value = obj[key];
    return typeof value === "number" ? value : undefined;
}

function getObject(
    obj: Record<string, unknown>,
    key: string
): Record<string, unknown> | undefined {
    const value = obj[key];
    return isObject(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// Per-type constraint extractors
// ---------------------------------------------------------------------------

export function extractStringConstraints(
    schema: Record<string, unknown>,
    diagnostics?: DiagnosticsOptions,
    pointer = ""
): StringConstraints {
    const c: StringConstraints = {};
    const minLength = getNumber(schema, "minLength");
    if (minLength !== undefined) c.minLength = minLength;
    const maxLength = getNumber(schema, "maxLength");
    if (maxLength !== undefined) c.maxLength = maxLength;
    const pattern = getString(schema, "pattern");
    if (pattern !== undefined) c.pattern = pattern;
    const format = getString(schema, "format");
    if (format !== undefined) {
        c.format = format;
        if (format !== "binary" && !KNOWN_FORMATS.has(format)) {
            emitDiagnostic(diagnostics, {
                code: "unknown-format",
                message: `Unknown format: ${format}`,
                pointer,
                detail: { format },
            });
        }
    }
    const contentEncoding = getString(schema, "contentEncoding");
    if (contentEncoding !== undefined) c.contentEncoding = contentEncoding;
    const contentMediaType = getString(schema, "contentMediaType");
    if (contentMediaType !== undefined) c.contentMediaType = contentMediaType;
    return c;
}

export function extractNumberConstraints(
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

export function extractArrayConstraints(
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
    const unevaluatedItems = getObject(schema, "unevaluatedItems");
    if (unevaluatedItems !== undefined) c.unevaluatedItems = unevaluatedItems;
    return c;
}

export function extractObjectConstraints(
    schema: Record<string, unknown>
): ObjectConstraints {
    const c: ObjectConstraints = {};
    const minProperties = getNumber(schema, "minProperties");
    if (minProperties !== undefined) c.minProperties = minProperties;
    const maxProperties = getNumber(schema, "maxProperties");
    if (maxProperties !== undefined) c.maxProperties = maxProperties;
    return c;
}

export function extractFileConstraints(
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
// Constraint stripping for type arrays
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

const ALL_CONSTRAINTS = new Set([
    ...STRING_CONSTRAINTS,
    ...NUMBER_CONSTRAINTS,
    ...ARRAY_CONSTRAINTS,
    ...OBJECT_CONSTRAINTS,
]);

/**
 * Return a copy of the schema with constraint keywords that don't apply
 * to the given type removed. Meta keywords (description, title, etc.)
 * and composition keywords are always preserved.
 */
export function stripInapplicableConstraints(
    schema: Record<string, unknown>,
    targetType: string
): Record<string, unknown> {
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
        if (ALL_CONSTRAINTS.has(key) && !keepForType.has(key)) {
            continue; // strip inapplicable constraint
        }
        result[key] = value;
    }
    return result;
}

// ---------------------------------------------------------------------------
// Known formats — used by extractStringConstraints to emit diagnostics
// ---------------------------------------------------------------------------

/**
 * JSON Schema formats that the library recognises.
 * Unknown formats emit an `unknown-format` diagnostic.
 */
const KNOWN_FORMATS: ReadonlySet<string> = new Set([
    "date-time",
    "date",
    "time",
    "uuid",
    "email",
    "ipv4",
    "ipv6",
    "uri",
    "uri-reference",
    "uri-template",
    "hostname",
    "binary",
    "byte",
    "password",
    "regex",
    "json-pointer",
    "relative-json-pointer",
]);
