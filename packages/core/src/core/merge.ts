/**
 * Schema merging, nullable detection, and discriminated union detection.
 *
 * Used by the walker to handle `allOf`, `anyOf [T, null]`, and
 * `oneOf` with discriminator properties.
 */

import { isObject } from "./guards.ts";

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
// $ref annotation sibling merging
// ---------------------------------------------------------------------------

/**
 * Annotation keywords that can appear as siblings of `$ref` per
 * Draft 2020-12 / OpenAPI 3.1. Structural keywords (type, properties,
 * etc.) are NOT annotation siblings and should not be merged.
 */
export const ANNOTATION_SIBLINGS: ReadonlySet<string> = new Set([
    "title",
    "description",
    "default",
    "examples",
    "deprecated",
    "readOnly",
    "writeOnly",
    "$comment",
]);

/**
 * Merge annotation siblings from the referencing node onto the
 * resolved target's annotations. The referencer wins for annotations.
 *
 * Structural keywords on the referencer are NOT merged — per spec,
 * `$ref` with structural siblings was invalid pre-2019-09.
 *
 * Returns a new meta object with the merged annotations.
 */
export function mergeRefSiblings(
    referencer: Record<string, unknown>,
    resolvedMeta: Record<string, unknown>
): Record<string, unknown> {
    const merged = { ...resolvedMeta };
    for (const key of ANNOTATION_SIBLINGS) {
        if (key in referencer) {
            merged[key] = referencer[key];
        }
    }
    return merged;
}

// ---------------------------------------------------------------------------
// allOf merging
// ---------------------------------------------------------------------------

/**
 * Merge multiple JSON Schema objects from allOf into one.
 * Merges: properties, required, meta fields, and constraints.
 */
export function mergeAllOf(schemas: unknown[]): Record<string, unknown> {
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

export interface NormalisedAnyOf {
    inner: Record<string, unknown>;
    isNullable: boolean;
}

/**
 * Detect `anyOf: [T, { type: "null" }]` → nullable T.
 * Returns the non-null schema and a nullable flag.
 */
export function normaliseAnyOf(
    options: unknown[]
): NormalisedAnyOf | undefined {
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

export interface Discriminated {
    options: Record<string, unknown>[];
    discriminator: string;
}

/**
 * Detect oneOf where every option is an object with a property
 * that has a `const` value → discriminated union.
 */
export function detectDiscriminated(
    options: unknown[]
): Discriminated | undefined {
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
