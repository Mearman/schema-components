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
import { deepNormaliseOpenApi30Doc } from "./openapi30.ts";
import { normaliseSwagger2Document } from "./swagger2.ts";

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
        // Non-schema values: pass through
        else {
            result[key] = value;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Draft 04: exclusiveMinimum/exclusiveMaximum boolean → number
// ---------------------------------------------------------------------------

/**
 * Normalise Draft 04 `exclusiveMinimum`/`exclusiveMaximum` from boolean
 * to number form.
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
 */
export function normaliseDraft04Node(
    node: Record<string, unknown>
): Record<string, unknown> {
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
 * If a `$recursiveAnchor` name is given (non-empty string), the ref
 * is converted to `$ref: "#<anchor>"` so the existing $anchor
 * resolution in ref.ts can find it.
 */
function normaliseDraft201909Node(
    node: Record<string, unknown>
): Record<string, unknown> {
    if (typeof node.$recursiveRef === "string") {
        // $recursiveRef resolves to the nearest $recursiveAnchor.
        // Convert to a standard $ref that the walker can resolve.
        node.$ref = "#";
        delete node.$recursiveRef;
    }
    // $recursiveAnchor: true → add as $anchor for proper resolution
    if (node.$recursiveAnchor === true) {
        // If there's already an $anchor, keep it
        if (typeof node.$anchor !== "string") {
            node.$anchor = "__recursive__";
        }
        delete node.$recursiveAnchor;
    }
    return node;
}

// ---------------------------------------------------------------------------
// Draft 2020-12: $dynamicRef → $ref
// ---------------------------------------------------------------------------

function normaliseDynamicRefNode(
    node: Record<string, unknown>
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
    return node;
}

// ---------------------------------------------------------------------------
// JSON Schema normalisation entry point
// ---------------------------------------------------------------------------

/**
 * Normalise a JSON Schema to canonical Draft 2020-12 form.
 * Deep-clones the input — the original is never mutated.
 */
export function normaliseJsonSchema(
    schema: Record<string, unknown>,
    draft: JsonSchemaDraft
): Record<string, unknown> {
    switch (draft) {
        case "draft-04":
            return deepNormalise(schema, normaliseDraft04Node);
        case "draft-2019-09":
            return deepNormalise(schema, normaliseDraft201909Node);
        case "draft-2020-12":
            return deepNormalise(schema, normaliseDynamicRefNode);
        case "draft-06":
        case "draft-07":
            return schema;
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
    version: OpenApiVersionInfo
): Record<string, unknown> {
    if (isSwagger2(version)) {
        return normaliseSwagger2Document(
            doc,
            deepNormalise,
            normaliseDraft04Node
        );
    }

    if (isOpenApi30(version)) {
        return deepNormaliseOpenApi30Doc(doc, deepNormalise);
    }

    // OpenAPI 3.1.x — already Draft 2020-12 compatible
    return doc;
}
