/**
 * Schema merging, nullable detection, and discriminated union detection.
 *
 * Used by the walker to handle `allOf`, `anyOf [T, null]`, and
 * `oneOf` with discriminator properties.
 */

import { isObject } from "./guards.ts";
import { isPrototypePollutingKey } from "./uri.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { appendPointer, emitDiagnostic } from "./diagnostics.ts";

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
 *
 * Cycle-safe: bundling external $refs via `structuredClone` preserves
 * object cycles, so constraint values reaching this comparator can be
 * cyclic. The co-recursive convention applies — when a pair of objects
 * (or arrays) is re-encountered during the same comparison we assume
 * equality holds and return true, letting any genuine inequality
 * elsewhere in the structure surface naturally without recursing
 * forever.
 */
function deepEqual(a: unknown, b: unknown): boolean {
    return deepEqualInner(a, b, new WeakMap());
}

function deepEqualInner(
    a: unknown,
    b: unknown,
    seen: WeakMap<object, WeakSet<object>>
): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        if (hasSeenPair(seen, a, b)) return true;
        recordPair(seen, a, b);
        for (let i = 0; i < a.length; i++) {
            if (!deepEqualInner(a[i], b[i], seen)) return false;
        }
        return true;
    }
    if (isObject(a) && isObject(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        if (hasSeenPair(seen, a, b)) return true;
        recordPair(seen, a, b);
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqualInner(a[key], b[key], seen)) return false;
        }
        return true;
    }
    return false;
}

function hasSeenPair(
    seen: WeakMap<object, WeakSet<object>>,
    a: object,
    b: object
): boolean {
    return seen.get(a)?.has(b) === true;
}

function recordPair(
    seen: WeakMap<object, WeakSet<object>>,
    a: object,
    b: object
): void {
    const existing = seen.get(a);
    if (existing === undefined) {
        const partners = new WeakSet<object>();
        partners.add(b);
        seen.set(a, partners);
        return;
    }
    existing.add(b);
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
 *
 * Boolean branches (valid per Draft 06+) collapse the composite:
 * - `false` makes the entire \`allOf\` unsatisfiable — return \`false\`,
 *   which the walker turns into a \`NeverField\`.
 * - \`true\` is the always-valid schema and contributes no constraints —
 *   skip silently.
 *
 * Type compatibility is enforced rather than papered over: two
 * branches asserting incompatible primitive `type` keywords
 * (e.g. `string` ∩ `number`) describe an unsatisfiable conjunction.
 * `mergeAllOf` returns `false` and emits
 * `schema-allof-incompatible` so the walker produces the same
 * `NeverField` shape it gives a top-level `false` schema. Pretending
 * the first type wins silently would silently weaken the constraint
 * for any consumer that reads the merged result.
 *
 * Non-boolean, non-object entries (e.g. arrays, numbers) are malformed
 * inputs that cannot represent a schema; skip them as before.
 */
export function mergeAllOf(
    schemas: unknown[],
    diagnostics?: DiagnosticsOptions,
    pointer = ""
): Record<string, unknown> | false {
    const merged: Record<string, unknown> = {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const entry of schemas) {
        if (entry === false) {
            // A \`false\` branch collapses the whole composite to never.
            return false;
        }
        if (entry === true) {
            // A \`true\` branch contributes no constraints.
            continue;
        }
        if (!isObject(entry)) continue;

        // Merge properties
        const props = getObject(entry, "properties");
        if (props !== undefined) {
            for (const [key, value] of Object.entries(props)) {
                // Defence in depth: refuse to merge `__proto__`,
                // `constructor`, or `prototype` as own properties. The
                // walker emits the same diagnostic when it traverses the
                // composite schema, but the silent drop here would
                // otherwise hide the fact that an allOf branch tried to
                // smuggle a prototype-polluting key into the merged
                // shape.
                if (isPrototypePollutingKey(key)) {
                    emitDiagnostic(diagnostics, {
                        code: "prototype-polluting-property",
                        message: `Refusing to merge prototype-polluting property name from allOf branch: ${key}`,
                        pointer: appendPointer(pointer, `properties/${key}`),
                        detail: { propertyName: key },
                    });
                    continue;
                }
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

        // Inherit type from first schema that has one. When two
        // branches assert different primitive `type` keywords the
        // intersection is empty — collapse to `false` and surface the
        // incompatibility rather than silently keeping the first.
        const entryType = getString(entry, "type");
        if (entryType !== undefined) {
            if (!("type" in merged)) {
                merged.type = entryType;
            } else if (!areCompatibleTypes(merged.type, entryType)) {
                emitDiagnostic(diagnostics, {
                    code: "schema-allof-incompatible",
                    message: `allOf branches assert incompatible \`type\` keywords (${describeType(merged.type)} ∩ ${describeType(entryType)}); the conjunction is unsatisfiable`,
                    pointer,
                    detail: {
                        types: [merged.type, entryType],
                    },
                });
                return false;
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

/**
 * Two `type` keyword values are compatible when their intersection is
 * non-empty. Identical strings always agree; `"integer"` is a subset
 * of `"number"` per JSON Schema 2020-12 §6.1.1 so the conjunction
 * collapses to `"integer"` and is treated as compatible here.
 * Mismatched primitives (`"string"` ∩ `"number"`, `"boolean"` ∩
 * `"object"`, etc.) describe an unsatisfiable intersection.
 *
 * `kept` carries the running merged value, which may already be an
 * array form produced by an earlier merge — in that case we conservatively
 * require deep equality to count as compatible, since narrowing the
 * intersection of two arbitrary type-array sets is out of scope here.
 */
function areCompatibleTypes(kept: unknown, incoming: string): boolean {
    if (typeof kept === "string") {
        if (kept === incoming) return true;
        // `integer` ⊂ `number` either way around.
        if (
            (kept === "integer" && incoming === "number") ||
            (kept === "number" && incoming === "integer")
        ) {
            return true;
        }
        return false;
    }
    // Non-string `type` (e.g. array form, malformed value) — fall back
    // to structural equality. Anything else is treated as compatible
    // to avoid false-positive collapses on shapes we do not yet model.
    return deepEqual(kept, incoming);
}

/**
 * Human-readable label for a `type` keyword value used in the
 * `schema-allof-incompatible` diagnostic message. Strings render
 * quoted; non-strings (array forms, malformed values) render via
 * `JSON.stringify` so the message still carries useful context.
 */
function describeType(value: unknown): string {
    if (typeof value === "string") return `"${value}"`;
    return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Nullable detection from anyOf
// ---------------------------------------------------------------------------

/**
 * Result returned by {@link normaliseAnyOf} when an `anyOf` schema
 * collapses to a nullable shape: the non-null branch and the nullable
 * flag.
 */
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

/**
 * Result returned by {@link detectDiscriminated} when a `oneOf` schema
 * is structurally a discriminated union: the option schemas plus the
 * shared property name carrying the const discriminator.
 */
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
 *
 * When two or more options share the same discriminator `const` value,
 * the union is still treated as discriminated (the first-match
 * behaviour in {@link import("./unionMatch.ts").resolveDiscriminatedActive}
 * resolves the active option), but a `discriminator-duplicate`
 * diagnostic is emitted so the unreachable branch is visible to the
 * consumer. Changing the behaviour to fall back to a generic union
 * would be a silent regression for the much commoner case of two
 * intentionally-identical discriminator values appearing in distinct
 * sub-schemas (e.g. an `allOf`-driven hierarchy where the base option
 * duplicates the leaf).
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

    const objectOptions = options.filter(isObject);

    // Detect duplicate discriminator `const` values. Downstream the
    // active-option resolver picks by `indexOf` on the rendered label
    // list, so any option past the first occurrence of a given value
    // is unreachable. We still treat the union as discriminated — that
    // matches the prior behaviour and keeps the surface area stable —
    // but surface the lost branch through a diagnostic so the consumer
    // is not blind to it.
    emitDuplicateDiscriminatorDiagnostic(
        objectOptions,
        discriminator,
        diagnostics,
        pointer
    );

    return { options: objectOptions, discriminator };
}

/**
 * Inspect the discriminator `const` value declared on each option and
 * emit a `discriminator-duplicate` diagnostic when two or more options
 * share the same value. The diagnostic detail carries the offending
 * value plus the indices of the colliding options so consumers can
 * point at them directly.
 */
function emitDuplicateDiscriminatorDiagnostic(
    options: readonly Record<string, unknown>[],
    discriminator: string,
    diagnostics: DiagnosticsOptions | undefined,
    pointer: string
): void {
    // Group option indices by serialised discriminator value. Stringify
    // via `JSON.stringify` so non-string discriminators (numbers,
    // booleans, null) participate in the comparison without coercing
    // `null` and the string `"null"` to the same bucket.
    const groups = new Map<string, { value: unknown; indices: number[] }>();
    for (const [index, option] of options.entries()) {
        const props = getObject(option, "properties");
        if (props === undefined) continue;
        const discriminatorSchema = getObject(props, discriminator);
        if (discriminatorSchema === undefined) continue;
        if (!("const" in discriminatorSchema)) continue;
        const constValue = discriminatorSchema.const;
        const key = JSON.stringify(constValue);
        const existing = groups.get(key);
        if (existing === undefined) {
            groups.set(key, { value: constValue, indices: [index] });
        } else {
            existing.indices.push(index);
        }
    }

    for (const { value, indices } of groups.values()) {
        if (indices.length < 2) continue;
        emitDiagnostic(diagnostics, {
            code: "discriminator-duplicate",
            message: `oneOf options ${indices.join(", ")} share the same discriminator value for "${discriminator}" (${JSON.stringify(value)}); only the first option is reachable`,
            pointer,
            detail: {
                discriminator,
                value,
                indices,
            },
        });
    }
}
