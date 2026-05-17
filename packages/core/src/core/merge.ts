/**
 * Schema merging, nullable detection, and discriminated union detection.
 *
 * Used by the walker to handle `allOf`, `anyOf [T, null]`, and
 * `oneOf` with discriminator properties.
 */

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

/**
 * Structural equality for arbitrary JSON-like values. Used to decide
 * whether a duplicated keyword across `allOf` branches genuinely
 * conflicts (different values) or is benign (identical values).
 */
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }
    if (isObject(a) && isObject(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }
    return false;
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
 *
 * Semantics are first-write-wins for meta and constraint keywords.
 * When a later branch redefines a keyword with a non-equal value the
 * later value is silently dropped — an `allof-conflict` diagnostic is
 * emitted so the loss is visible to consumers.
 */
export function mergeAllOf(
    schemas: unknown[],
    diagnostics?: DiagnosticsOptions,
    pointer = ""
): Record<string, unknown> {
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
            } else if (!deepEqual(merged[key], value)) {
                emitDiagnostic(diagnostics, {
                    code: "allof-conflict",
                    message: `allOf branches define conflicting values for "${key}"; keeping the first occurrence and discarding subsequent values`,
                    pointer,
                    detail: {
                        key,
                        kept: merged[key],
                        discarded: value,
                    },
                });
            }
        }

        // Inherit type from first schema that has one
        const entryType = getString(entry, "type");
        if (entryType !== undefined) {
            if (!("type" in merged)) {
                merged.type = entryType;
            } else if (!deepEqual(merged.type, entryType)) {
                emitDiagnostic(diagnostics, {
                    code: "allof-conflict",
                    message: `allOf branches define conflicting values for "type"; keeping the first occurrence and discarding subsequent values`,
                    pointer,
                    detail: {
                        key: "type",
                        kept: merged.type,
                        discarded: entryType,
                    },
                });
            }
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
 *
 * When options carry inconsistent discriminator candidates (e.g. one
 * uses `kind` while another uses `type`) detection fails and a
 * `discriminator-inconsistent` diagnostic is emitted so callers can
 * see why the union falls back to a generic oneOf.
 */
export function detectDiscriminated(
    options: unknown[],
    diagnostics?: DiagnosticsOptions,
    pointer = ""
): Discriminated | undefined {
    if (options.length === 0) return undefined;

    // All options must be objects with properties
    let discriminator: string | undefined;
    const perOptionKeys: (string | undefined)[] = [];

    for (const opt of options) {
        if (!isObject(opt)) return undefined;

        const props = getObject(opt, "properties");
        if (props === undefined) return undefined;

        // Collect every property in this option that carries a `const`,
        // so we can report a meaningful diagnostic when options disagree.
        const constKeys: string[] = [];
        for (const [key, value] of Object.entries(props)) {
            if (isObject(value) && "const" in value) {
                constKeys.push(key);
            }
        }

        if (constKeys.length === 0) {
            perOptionKeys.push(undefined);
            continue;
        }

        // First const property wins as this option's discriminator candidate
        const foundKey = constKeys[0];
        perOptionKeys.push(foundKey);

        discriminator ??= foundKey;
    }

    // If any option lacked a const property, this is not a discriminated union
    if (perOptionKeys.some((k) => k === undefined)) return undefined;

    // All options must agree on the discriminator key
    const uniqueKeys = new Set(perOptionKeys);
    if (uniqueKeys.size > 1) {
        emitDiagnostic(diagnostics, {
            code: "discriminator-inconsistent",
            message: `oneOf options use inconsistent discriminator keys (${[...uniqueKeys].map((k) => `"${k ?? ""}"`).join(", ")}); rendering as a generic union`,
            pointer,
            detail: {
                candidates: perOptionKeys,
            },
        });
        return undefined;
    }

    if (discriminator === undefined) return undefined;

    return { options: options.filter(isObject), discriminator };
}
