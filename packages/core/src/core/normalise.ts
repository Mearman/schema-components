/**
 * Schema normalisation — transforms version-specific JSON Schema and
 * OpenAPI constructs into the canonical Draft 2020-12 format the walker
 * understands.
 *
 * Each normaliser deep-clones the input (no mutation) and recursively
 * walks all sub-schemas to apply per-node transformations.
 *
 * Supported transformations:
 * - Draft 04: `exclusiveMinimum`/`exclusiveMaximum` boolean → number
 * - Draft 2019-09: `$recursiveRef` → `$ref`
 * - Draft 2020-12: `$dynamicRef` → `$ref`
 * - OpenAPI 3.0.x: `nullable` → `anyOf [T, null]`, `example` → `examples`, `discriminator` → `const`
 * - Swagger 2.0: full document restructure to OpenAPI 3.1
 */

import type { JsonSchemaDraft, OpenApiVersionInfo } from "./version.ts";
import { isOpenApi30, isSwagger2 } from "./version.ts";
import { isObject } from "./guards.ts";
import {
    deepNormaliseOpenApi30Doc,
    deepNormaliseOpenApiDoc,
    normaliseOpenApi30Discriminator,
} from "./openapi30.ts";
import { normaliseSwagger2Document } from "./swagger2.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { appendPointer, emitDiagnostic } from "./diagnostics.ts";

// ---------------------------------------------------------------------------
// Sub-schema location keys
// ---------------------------------------------------------------------------

/**
 * Keys whose values are `Record<string, SubSchema>` — objects where each
 * property is a sub-schema.
 */
const OBJECT_SUBSCHEMA_KEYS: ReadonlySet<string> = new Set([
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
]);

/**
 * Keys whose values are `SubSchema[]` — arrays of sub-schemas.
 */
const ARRAY_SUBSCHEMA_KEYS: ReadonlySet<string> = new Set([
    "allOf",
    "anyOf",
    "oneOf",
    "prefixItems",
]);

/**
 * Keys whose values are a single sub-schema object.
 */
const SINGLE_SUBSCHEMA_KEYS: ReadonlySet<string> = new Set([
    "additionalProperties",
    "not",
    "contains",
    "propertyNames",
    "if",
    "then",
    "else",
    "unevaluatedProperties",
    "unevaluatedItems",
]);

// ---------------------------------------------------------------------------
// Recursive normalisation engine
// ---------------------------------------------------------------------------

export type NodeTransform = (
    node: Record<string, unknown>
) => Record<string, unknown>;

/**
 * Normalise each element of an unknown array by applying deepNormalise
 * to object elements and passing others through unchanged.
 */
function normaliseArray(items: unknown[], transform: NodeTransform): unknown[] {
    const result: unknown[] = [];
    for (const item of items) {
        result.push(isObject(item) ? deepNormalise(item, transform) : item);
    }
    return result;
}

/**
 * Normalise each value of a sub-schema map (e.g. properties, $defs).
 */
function normaliseSubSchemaMap(
    map: Record<string, unknown>,
    transform: NodeTransform
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(map)) {
        result[k] = isObject(v) ? deepNormalise(v, transform) : v;
    }
    return result;
}

/**
 * Deep-normalise a JSON Schema object by applying a per-node transform
 * and recursing into every sub-schema location.
 */
export function deepNormalise(
    schema: Record<string, unknown>,
    transform: NodeTransform
): Record<string, unknown> {
    // Apply the per-node transform first
    const node = transform({ ...schema });

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
        // Record<string, SubSchema>
        if (isObject(value) && OBJECT_SUBSCHEMA_KEYS.has(key)) {
            result[key] = normaliseSubSchemaMap(value, transform);
        }
        // SubSchema[]
        else if (Array.isArray(value) && ARRAY_SUBSCHEMA_KEYS.has(key)) {
            result[key] = normaliseArray(value, transform);
        }
        // Single SubSchema
        else if (isObject(value) && SINGLE_SUBSCHEMA_KEYS.has(key)) {
            result[key] = deepNormalise(value, transform);
        }
        // items: can be a single sub-schema OR an array (Draft 04 tuples)
        else if (key === "items") {
            if (Array.isArray(value)) {
                result[key] = normaliseArray(value, transform);
            } else if (isObject(value)) {
                result[key] = deepNormalise(value, transform);
            } else {
                result[key] = value;
            }
        }
        // dependencies: mixed map — string[] values pass through,
        // schema-object values need recursive normalisation.
        // After the per-node transform, this key will have been removed
        // (replaced by dependentRequired/dependentSchemas), but during
        // recursion the transform hasn't run yet on children.
        else if (key === "dependencies" && isObject(value)) {
            const normalised: Record<string, unknown> = {};
            for (const [dk, dv] of Object.entries(value)) {
                if (isObject(dv)) {
                    normalised[dk] = deepNormalise(dv, transform);
                } else {
                    normalised[dk] = dv;
                }
            }
            result[key] = normalised;
        }
        // Non-schema values: pass through
        else {
            result[key] = value;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Context-aware normalisation (JSON Schema path)
// ---------------------------------------------------------------------------

/**
 * Per-node context threaded through `deepNormaliseWithContext`.
 *
 * Carries the diagnostics sink and the JSON Pointer to the current
 * node so per-node transforms can emit pointer-accurate diagnostics
 * when they translate or reject legacy constructs.
 */
export interface NodeContext {
    diagnostics: DiagnosticsOptions | undefined;
    pointer: string;
}

export type NodeTransformWithContext = (
    node: Record<string, unknown>,
    ctx: NodeContext
) => Record<string, unknown>;

function normaliseArrayWithContext(
    items: unknown[],
    transform: NodeTransformWithContext,
    ctx: NodeContext
): unknown[] {
    const result: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (isObject(item)) {
            result.push(
                deepNormaliseWithContext(item, transform, {
                    diagnostics: ctx.diagnostics,
                    pointer: appendPointer(ctx.pointer, String(i)),
                })
            );
        } else {
            result.push(item);
        }
    }
    return result;
}

function normaliseSubSchemaMapWithContext(
    map: Record<string, unknown>,
    transform: NodeTransformWithContext,
    ctx: NodeContext
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(map)) {
        if (isObject(v)) {
            result[k] = deepNormaliseWithContext(v, transform, {
                diagnostics: ctx.diagnostics,
                pointer: appendPointer(ctx.pointer, k),
            });
        } else {
            result[k] = v;
        }
    }
    return result;
}

/**
 * Deep-normalise a JSON Schema object, threading a context (diagnostics
 * sink + JSON Pointer) through each recursive call. Used by the JSON
 * Schema normalisation path so per-node transforms can emit diagnostics
 * with accurate pointers.
 *
 * Mirrors `deepNormalise` structurally — keep the two in sync when
 * adding new sub-schema locations.
 */
export function deepNormaliseWithContext(
    schema: Record<string, unknown>,
    transform: NodeTransformWithContext,
    ctx: NodeContext
): Record<string, unknown> {
    const node = transform({ ...schema }, ctx);

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
        if (isObject(value) && OBJECT_SUBSCHEMA_KEYS.has(key)) {
            result[key] = normaliseSubSchemaMapWithContext(value, transform, {
                diagnostics: ctx.diagnostics,
                pointer: appendPointer(ctx.pointer, key),
            });
        } else if (Array.isArray(value) && ARRAY_SUBSCHEMA_KEYS.has(key)) {
            result[key] = normaliseArrayWithContext(value, transform, {
                diagnostics: ctx.diagnostics,
                pointer: appendPointer(ctx.pointer, key),
            });
        } else if (isObject(value) && SINGLE_SUBSCHEMA_KEYS.has(key)) {
            result[key] = deepNormaliseWithContext(value, transform, {
                diagnostics: ctx.diagnostics,
                pointer: appendPointer(ctx.pointer, key),
            });
        } else if (key === "items") {
            if (Array.isArray(value)) {
                result[key] = normaliseArrayWithContext(value, transform, {
                    diagnostics: ctx.diagnostics,
                    pointer: appendPointer(ctx.pointer, key),
                });
            } else if (isObject(value)) {
                result[key] = deepNormaliseWithContext(value, transform, {
                    diagnostics: ctx.diagnostics,
                    pointer: appendPointer(ctx.pointer, key),
                });
            } else {
                result[key] = value;
            }
        } else if (key === "dependencies" && isObject(value)) {
            // Schema-object dependency values still need recursive
            // normalisation in case the parent transform left them in
            // place (e.g. for the 2019-09 path which does not split).
            const normalised: Record<string, unknown> = {};
            const depsPointer = appendPointer(ctx.pointer, key);
            for (const [dk, dv] of Object.entries(value)) {
                if (isObject(dv)) {
                    normalised[dk] = deepNormaliseWithContext(dv, transform, {
                        diagnostics: ctx.diagnostics,
                        pointer: appendPointer(depsPointer, dk),
                    });
                } else {
                    normalised[dk] = dv;
                }
            }
            result[key] = normalised;
        } else {
            result[key] = value;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Legacy `dependencies` splitting (Draft 04–07)
// ---------------------------------------------------------------------------

/**
 * Walk an array of supposed required-property names. Each non-string
 * element triggers a `dependent-required-invalid` diagnostic against
 * the supplied context. Returns the collected string entries when
 * every element validates, or `undefined` when at least one entry
 * was invalid (signalling the caller should drop the property
 * entirely rather than emit a partial rewrite).
 *
 * `keyword` distinguishes diagnostics that originate from the legacy
 * `dependencies` keyword versus the modern `dependentRequired`.
 */
function collectDependencyStrings(
    items: readonly unknown[],
    property: string,
    keyword: "dependencies" | "dependentRequired",
    ctx: NodeContext | undefined
): string[] | undefined {
    const strings: string[] = [];
    let sawInvalid = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item === "string") {
            strings.push(item);
            continue;
        }
        sawInvalid = true;
        if (ctx === undefined) continue;
        emitDiagnostic(ctx.diagnostics, {
            code: "dependent-required-invalid",
            message: `\`${keyword}.${property}[${String(i)}]\` is not a string; only string property names are valid in a required-dependency array`,
            pointer: appendPointer(
                appendPointer(appendPointer(ctx.pointer, keyword), property),
                String(i)
            ),
            detail: { property, index: i, value: item },
        });
    }
    return sawInvalid ? undefined : strings;
}

/**
 * Split the legacy `dependencies` keyword into `dependentRequired` and
 * `dependentSchemas` per the Draft 2019-09+ replacement.
 *
 * Each key in `dependencies` maps to either:
 * - `string[]` → `dependentRequired`
 * - A schema object → `dependentSchemas`
 *
 * Both forms can coexist within the same `dependencies` object.
 * After splitting, `dependencies` is removed from the node.
 *
 * When `ctx` is supplied, diagnostics are emitted for:
 * - `legacy-dependencies-split` once per node that contained the
 *   deprecated keyword (callers pass this only on draft paths where
 *   the keyword is unexpected, e.g. 2020-12).
 * - `dependent-required-invalid` for each array entry whose element is
 *   not a string.
 */
function splitDependencies(
    node: Record<string, unknown>,
    ctx: NodeContext | undefined,
    emitLegacyDiagnostic: boolean
): void {
    const deps = node.dependencies;
    if (!isObject(deps)) return;

    if (emitLegacyDiagnostic && ctx !== undefined) {
        emitDiagnostic(ctx.diagnostics, {
            code: "legacy-dependencies-split",
            message:
                "Legacy `dependencies` keyword was split into `dependentRequired`/`dependentSchemas`; `dependencies` was deprecated in Draft 2019-09",
            pointer: appendPointer(ctx.pointer, "dependencies"),
            detail: { keys: Object.keys(deps) },
        });
    }

    const requiredEntries: Record<string, string[]> = {};
    const schemaEntries: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(deps)) {
        if (Array.isArray(value)) {
            const accepted = collectDependencyStrings(
                value,
                key,
                "dependencies",
                ctx
            );
            // Drop the entry entirely when any element is invalid —
            // partial-rewriting silently produces weaker constraints
            // than the author specified, masking the bug.
            if (accepted !== undefined) {
                requiredEntries[key] = accepted;
            }
        } else if (isObject(value)) {
            schemaEntries[key] = value;
        }
        // Malformed values (neither string[] nor schema object) are dropped.
        // The walker will not encounter them, which is the correct behaviour
        // for invalid input.
    }

    if (Object.keys(requiredEntries).length > 0) {
        // Merge with any existing dependentRequired
        const existing = node.dependentRequired;
        if (isObject(existing)) {
            for (const [k, v] of Object.entries(requiredEntries)) {
                existing[k] = v;
            }
        } else {
            node.dependentRequired = requiredEntries;
        }
    }

    if (Object.keys(schemaEntries).length > 0) {
        // Merge with any existing dependentSchemas
        const existing = node.dependentSchemas;
        if (isObject(existing)) {
            for (const [k, v] of Object.entries(schemaEntries)) {
                existing[k] = v;
            }
        } else {
            node.dependentSchemas = schemaEntries;
        }
    }

    delete node.dependencies;
}

/**
 * Emit diagnostics for any non-string entries inside a pre-existing
 * `dependentRequired` keyword. Used on draft paths where the author may
 * have already migrated to the Draft 2019-09 form but still produced
 * invalid array entries. The keyword value is not rewritten — the
 * walker is responsible for honouring (or rejecting) the constraint.
 */
function validateDependentRequired(
    node: Record<string, unknown>,
    ctx: NodeContext | undefined
): void {
    if (ctx === undefined) return;
    const dr = node.dependentRequired;
    if (!isObject(dr)) return;
    for (const [key, value] of Object.entries(dr)) {
        if (!Array.isArray(value)) continue;
        // The return value is discarded — diagnostics fire via ctx and
        // the original array is preserved on the node either way.
        collectDependencyStrings(value, key, "dependentRequired", ctx);
    }
}

// ---------------------------------------------------------------------------
// Draft 04: exclusiveMinimum/exclusiveMaximum boolean → number
// ---------------------------------------------------------------------------

/**
 * Apply the version-agnostic Draft 04 keyword translations to a single
 * node: boolean exclusive-min/max → number form, bare `id` → `$id`, and
 * tuple-form `items` → `prefixItems`.
 *
 * `divisibleBy` is also translated to `multipleOf` (a Draft 03 carryover
 * that legitimately appears in legacy Draft 04 schemas). When `ctx` is
 * supplied and both keywords are present with conflicting values, a
 * `divisible-by-conflict` diagnostic is emitted.
 *
 * `dependencies` is split into `dependentRequired`/`dependentSchemas`
 * via {@link splitDependencies}; passing `ctx` enables per-entry
 * diagnostics for non-string array members.
 */
function applyDraft04Translations(
    node: Record<string, unknown>,
    ctx: NodeContext | undefined
): void {
    // exclusiveMinimum: true + minimum: N → exclusiveMinimum: N
    if (node.exclusiveMinimum === true && typeof node.minimum === "number") {
        node.exclusiveMinimum = node.minimum;
        delete node.minimum;
    }
    // exclusiveMinimum: false → remove (it's the default)
    else if (node.exclusiveMinimum === false) {
        delete node.exclusiveMinimum;
    }

    // exclusiveMaximum: true + maximum: N → exclusiveMaximum: N
    if (node.exclusiveMaximum === true && typeof node.maximum === "number") {
        node.exclusiveMaximum = node.maximum;
        delete node.maximum;
    }
    // exclusiveMaximum: false → remove (it's the default)
    else if (node.exclusiveMaximum === false) {
        delete node.exclusiveMaximum;
    }

    // Draft 03 carryover: `divisibleBy` → `multipleOf`. Frequently appears
    // in legacy Draft 04 schemas where authors copied from older specs.
    const divisibleBy = node.divisibleBy;
    if (typeof divisibleBy === "number") {
        const multipleOf = node.multipleOf;
        if (typeof multipleOf === "number") {
            // Both present — keep the existing `multipleOf` (the modern
            // keyword wins) but surface the conflict so callers can fix
            // the source schema.
            if (ctx !== undefined && divisibleBy !== multipleOf) {
                emitDiagnostic(ctx.diagnostics, {
                    code: "divisible-by-conflict",
                    message: `Legacy \`divisibleBy\` (${String(divisibleBy)}) conflicts with \`multipleOf\` (${String(multipleOf)}); keeping \`multipleOf\``,
                    pointer: ctx.pointer,
                    detail: { divisibleBy, multipleOf },
                });
            }
        } else {
            node.multipleOf = divisibleBy;
        }
        delete node.divisibleBy;
    }

    // Draft 04: `id` → `$id`
    if (typeof node.id === "string" && !("$id" in node)) {
        node.$id = node.id;
        delete node.id;
    }

    // Draft 04: items as array → prefixItems (tuple v1 syntax)
    if (Array.isArray(node.items) && !("prefixItems" in node)) {
        node.prefixItems = node.items;
        delete node.items;
        // Draft 04 tuple: additionalItems → items for the rest
        if ("additionalItems" in node) {
            node.items = node.additionalItems;
            delete node.additionalItems;
        }
    }

    // Draft 04: dependencies → dependentRequired + dependentSchemas.
    // The legacy keyword is expected on this path, so we do not emit
    // `legacy-dependencies-split` — but per-entry validation still runs.
    splitDependencies(node, ctx, false);

    // Validate any pre-existing dependentRequired entries the author
    // may have already migrated to.
    validateDependentRequired(node, ctx);
}

/**
 * Normalise Draft 04 `exclusiveMinimum`/`exclusiveMaximum` from boolean
 * to number form, plus the other Draft 04 translations applied to a
 * single node.
 *
 * In Draft 04:
 * - `exclusiveMinimum: true` + `minimum: 5` → value must be > 5
 * - `exclusiveMinimum: false` (or absent) + `minimum: 5` → value must be >= 5
 *
 * In Draft 06+:
 * - `exclusiveMinimum: 5` → value must be > 5 (no separate `minimum`)
 * - `minimum: 5` → value must be >= 5
 *
 * The transform converts boolean form to number form so the walker can
 * treat `exclusiveMinimum`/`exclusiveMaximum` uniformly as numbers.
 *
 * This function preserves the no-context signature for the OpenAPI 3.0
 * and Swagger 2.0 normalisers that compose it directly. The JSON Schema
 * normalisation path uses {@link normaliseDraft04NodeWithContext} via
 * {@link deepNormaliseWithContext} to thread diagnostics.
 */
export function normaliseDraft04Node(
    node: Record<string, unknown>
): Record<string, unknown> {
    applyDraft04Translations(node, undefined);
    return node;
}

/**
 * Context-aware Draft 04 per-node transform. Identical to
 * {@link normaliseDraft04Node} but threads a {@link NodeContext} so
 * `divisibleBy`/`multipleOf` conflicts and invalid dependency entries
 * can be surfaced as diagnostics with accurate pointers.
 */
function normaliseDraft04NodeWithContext(
    node: Record<string, unknown>,
    ctx: NodeContext
): Record<string, unknown> {
    applyDraft04Translations(node, ctx);
    return node;
}

// ---------------------------------------------------------------------------
// Draft 06/07: dependencies splitting + passthrough normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise Draft 06/07 nodes.
 *
 * These drafts introduced `exclusiveMinimum`/`exclusiveMaximum` as numbers
 * (already in final form) and `const`/`examples`, but still use the
 * legacy `dependencies` keyword. Split it into `dependentRequired` /
 * `dependentSchemas` so the walker can process them uniformly.
 */
function normaliseDraft06Or07NodeWithContext(
    node: Record<string, unknown>,
    ctx: NodeContext
): Record<string, unknown> {
    splitDependencies(node, ctx, false);
    validateDependentRequired(node, ctx);
    return node;
}

// ---------------------------------------------------------------------------
// Draft 2019-09: $recursiveRef → $ref
// ---------------------------------------------------------------------------

/**
 * Normalise Draft 2019-09 `$recursiveRef` to `$ref`.
 *
 * `$recursiveRef` resolves to the nearest `$recursiveAnchor` in the
 * dynamic scope. For rendering, the common pattern is a root
 * `$recursiveAnchor: true` — the normaliser converts
 * `$recursiveRef: "#"` to `$ref: "#"` pointing to the root.
 *
 * The original `$recursiveRef` value is preserved (rather than
 * collapsed to `"#"`) so that anchored variants such as
 * `$recursiveRef: "#meta"` resolve correctly against the
 * corresponding `$recursiveAnchor` name. String-valued
 * `$recursiveAnchor` names are likewise preserved as `$anchor`.
 */
function normaliseDraft201909NodeWithContext(
    node: Record<string, unknown>,
    ctx: NodeContext
): Record<string, unknown> {
    if (typeof node.$recursiveRef === "string") {
        // Preserve the original ref string — anchored forms such as
        // "#meta" must round-trip into `$ref` unchanged so $anchor
        // resolution can find the matching `$recursiveAnchor`.
        node.$ref = node.$recursiveRef;
        delete node.$recursiveRef;
    }
    if (node.$recursiveAnchor === true) {
        // Bare `true` — add the canonical recursive marker as `$anchor`.
        if (typeof node.$anchor !== "string") {
            node.$anchor = "__recursive__";
        }
        delete node.$recursiveAnchor;
    } else if (typeof node.$recursiveAnchor === "string") {
        // String-valued `$recursiveAnchor` preserves the authored name.
        if (typeof node.$anchor !== "string") {
            node.$anchor = node.$recursiveAnchor;
        }
        delete node.$recursiveAnchor;
    }
    // Draft 2019-09 introduced dependentRequired/dependentSchemas but
    // still permits the legacy `dependencies` keyword. Validate any
    // pre-existing dependentRequired entries the author migrated to.
    validateDependentRequired(node, ctx);
    return node;
}

// ---------------------------------------------------------------------------
// Draft 2020-12: $dynamicRef → $ref
// ---------------------------------------------------------------------------

function normaliseDynamicRefNodeWithContext(
    node: Record<string, unknown>,
    ctx: NodeContext
): Record<string, unknown> {
    if (typeof node.$dynamicRef === "string") {
        // $dynamicRef resolves to the $dynamicAnchor in the dynamic scope.
        // Convert to a standard $ref that the walker can resolve.
        const fragment = node.$dynamicRef;
        // If it's just "#", point to root. If it's "#SomeName", keep it
        // so $anchor resolution can find the matching $dynamicAnchor.
        node.$ref = fragment;
        delete node.$dynamicRef;
    }
    // $dynamicAnchor → $anchor so ref.ts can find it
    if (typeof node.$dynamicAnchor === "string") {
        // Preserve existing $anchor if present
        if (typeof node.$anchor !== "string") {
            node.$anchor = node.$dynamicAnchor;
        }
        delete node.$dynamicAnchor;
    }
    // Defensive translation of the legacy `dependencies` keyword on the
    // 2020-12 path: schemas reaching this branch may have no `$schema`
    // at all (the inference default), so authors who copy snippets from
    // older drafts can still produce `dependencies`. The walker does not
    // read it, so without translation the constraints would be silently
    // lost. Surface the rewrite via a diagnostic.
    splitDependencies(node, ctx, true);
    validateDependentRequired(node, ctx);
    return node;
}

// ---------------------------------------------------------------------------
// JSON Schema normalisation entry point
// ---------------------------------------------------------------------------

/**
 * Normalise a JSON Schema to canonical Draft 2020-12 form.
 * Deep-clones the input — the original is never mutated.
 *
 * When `diagnostics` is supplied, per-node transforms emit diagnostics
 * for legacy-keyword rewrites and invalid constructs (e.g. `divisibleBy`
 * conflicts, non-string entries in a `dependentRequired` array, legacy
 * `dependencies` reaching the 2020-12 path).
 */
export function normaliseJsonSchema(
    schema: Record<string, unknown>,
    draft: JsonSchemaDraft,
    diagnostics?: DiagnosticsOptions
): Record<string, unknown> {
    const ctx: NodeContext = { diagnostics, pointer: "" };
    switch (draft) {
        case "draft-04":
            return deepNormaliseWithContext(
                schema,
                normaliseDraft04NodeWithContext,
                ctx
            );
        case "draft-2019-09":
            return deepNormaliseWithContext(
                schema,
                normaliseDraft201909NodeWithContext,
                ctx
            );
        case "draft-2020-12":
            return deepNormaliseWithContext(
                schema,
                normaliseDynamicRefNodeWithContext,
                ctx
            );
        case "draft-06":
        case "draft-07":
            return deepNormaliseWithContext(
                schema,
                normaliseDraft06Or07NodeWithContext,
                ctx
            );
    }
}

// ---------------------------------------------------------------------------
// OpenAPI normalisation entry point
// ---------------------------------------------------------------------------

/**
 * Normalise an OpenAPI document's schemas for walker consumption.
 * Handles version-specific keyword transformations.
 *
 * Returns the same object reference if no normalisation is needed
 * (OpenAPI 3.1.x), or a deep-cloned normalised copy otherwise.
 */
export function normaliseOpenApiSchemas(
    doc: Record<string, unknown>,
    version: OpenApiVersionInfo,
    diagnostics?: DiagnosticsOptions
): Record<string, unknown> {
    if (isSwagger2(version)) {
        return normaliseSwagger2Document(
            doc,
            deepNormalise,
            normaliseDraft04Node,
            diagnostics
        );
    }

    if (isOpenApi30(version)) {
        return deepNormaliseOpenApi30Doc(doc, deepNormalise);
    }

    // OpenAPI 3.1.x — already Draft 2020-12 compatible, but the
    // `discriminator` keyword (carried over from 3.0) still uses
    // `propertyName` + `mapping` rather than per-option `const`s. The
    // walker's discriminated-union detection relies on `const`s being
    // present on each option, so apply the discriminator transform
    // (only) to every Schema Object in the document. This keeps 3.1 and
    // 3.0 producing identical walker input for the same logical
    // discriminated union — and 3.1 does not have boolean `nullable`,
    // so the rest of the 3.0 combined transform must not run here.
    return deepNormaliseOpenApiDoc(doc, (schema) =>
        deepNormalise(schema, normaliseOpenApi30Discriminator)
    );
}
