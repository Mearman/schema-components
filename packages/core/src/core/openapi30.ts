/**
 * OpenAPI 3.0.x schema normalisation.
 *
 * Transforms `nullable`, `discriminator`, `example` keywords, and walks
 * all schema locations (components, paths, parameters, request bodies,
 * responses, headers, callbacks, links, examples) to apply normalisation.
 */

import { isObject } from "../core/guards.ts";
import type { NodeTransform } from "./normalise.ts";
import { normaliseDraft04Node } from "./normalise.ts";

// ---------------------------------------------------------------------------
// Re-exported node transforms (used by normalise.ts entry points)
// ---------------------------------------------------------------------------

/**
 * Normalise OpenAPI 3.0.x `nullable` keyword to `anyOf [T, null]`.
 *
 * OpenAPI 3.0 uses `nullable: true` instead of the JSON Schema standard
 * `anyOf: [T, { type: "null" }]`. The walker understands the latter form
 * natively, so this normaliser converts `nullable` to `anyOf`.
 *
 * Only applied when `nullable` is explicitly `true`. `nullable: false` or
 * absent is the default and requires no transformation.
 */
export function normaliseOpenApi30Node(
    node: Record<string, unknown>
): Record<string, unknown> {
    // Normalise example → examples (OpenAPI 3.0 uses singular, 3.1 uses array)
    if ("example" in node && !("examples" in node)) {
        node.examples = [node.example];
        delete node.example;
    } else if ("example" in node) {
        delete node.example;
    }

    if (node.nullable !== true) {
        // nullable: false or absent — just strip the keyword if present
        if ("nullable" in node) {
            delete node.nullable;
        }
        return node;
    }

    // nullable: true — transform to anyOf [T, null]
    const nullOption: Record<string, unknown> = { type: "null" };

    // If the node already has anyOf, append null option
    if (Array.isArray(node.anyOf)) {
        const existing: unknown[] = node.anyOf;
        node.anyOf = [...existing, nullOption];
        delete node.nullable;
        return node;
    }

    // If the node already has oneOf, convert to anyOf and append null
    if (Array.isArray(node.oneOf)) {
        const existing: unknown[] = node.oneOf;
        node.anyOf = [...existing, nullOption];
        delete node.oneOf;
        delete node.nullable;
        return node;
    }

    // If the node already has allOf, wrap merged result with null
    if (Array.isArray(node.allOf)) {
        const existing: unknown[] = node.allOf;
        node.anyOf = [{ allOf: existing }, nullOption];
        delete node.allOf;
        delete node.nullable;
        return node;
    }

    // Simple case: wrap current node in anyOf [self, null]
    // Build wrapper with all current properties except nullable
    const wrapper: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
        if (key !== "nullable") {
            wrapper[key] = value;
        }
    }

    // Return a new node with only anyOf — discards all previous keys
    return { anyOf: [wrapper, nullOption] };
}

// ---------------------------------------------------------------------------
// Discriminator normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise OpenAPI 3.0.x `discriminator` keyword by injecting `const`
 * values into each `oneOf`/`anyOf` option's discriminator property.
 *
 * In OpenAPI 3.0, `discriminator` is a sibling of `oneOf`/`anyOf`:
 *   discriminator: { propertyName: "type" }
 * The walker detects discriminated unions from `oneOf` + `const` on a
 * property, so this normaliser injects the `const` values from the
 * `mapping` or infers them from `$ref` fragment names.
 */
export function normaliseOpenApi30Discriminator(
    node: Record<string, unknown>
): Record<string, unknown> {
    const discriminator = node.discriminator;
    if (!isObject(discriminator)) return node;

    const propertyName = discriminator.propertyName;
    if (typeof propertyName !== "string") return node;

    const mapping = isObject(discriminator.mapping)
        ? discriminator.mapping
        : undefined;

    const composite = node.oneOf ?? node.anyOf;
    if (!Array.isArray(composite)) return node;

    // Build reverse mapping: $ref → const value
    const refToValue = new Map<string, string>();
    if (mapping !== undefined) {
        for (const [value, ref] of Object.entries(mapping)) {
            if (typeof ref === "string") {
                refToValue.set(ref, value);
            }
        }
    }

    // Inject const into each option that doesn't already have it
    const normalisedComposite: unknown[] = [];
    for (const option of composite) {
        if (!isObject(option)) {
            normalisedComposite.push(option);
            continue;
        }

        const props = isObject(option.properties)
            ? { ...option.properties }
            : undefined;
        const discProp = props?.[propertyName];

        // If the discriminator property already has const, leave as-is
        if (isObject(discProp) && "const" in discProp) {
            normalisedComposite.push(option);
            continue;
        }

        // Determine the const value
        let constValue: string | undefined;
        if (isObject(discProp) && typeof discProp.$ref === "string") {
            constValue = refToValue.get(discProp.$ref);
        }
        if (constValue === undefined && typeof option.$ref === "string") {
            constValue = refToValue.get(option.$ref);
            // Fallback: derive from $ref fragment name
            if (constValue === undefined) {
                const fragment = option.$ref.split("/").pop();
                if (fragment !== undefined) constValue = fragment;
            }
        }
        // Inline option with mapping: reverse-lookup by matching option index
        // to mapping entries in order
        if (constValue === undefined && mapping !== undefined) {
            const optionIndex = composite.indexOf(option);
            const mappingEntries = Object.entries(mapping);
            const entry =
                optionIndex >= 0 && optionIndex < mappingEntries.length
                    ? mappingEntries[optionIndex]
                    : undefined;
            if (entry !== undefined) {
                constValue = entry[0];
            }
        }

        if (constValue !== undefined) {
            const normalisedProps = props ?? {};
            normalisedProps[propertyName] = {
                ...(isObject(discProp) ? discProp : {}),
                const: constValue,
            };
            normalisedComposite.push({
                ...option,
                properties: normalisedProps,
            });
        } else {
            normalisedComposite.push(option);
        }
    }

    // Update the composite array in-place
    if ("oneOf" in node) {
        node.oneOf = normalisedComposite;
    } else if ("anyOf" in node) {
        node.anyOf = normalisedComposite;
    }

    // Remove discriminator — no longer needed after const injection
    delete node.discriminator;
    return node;
}

// ---------------------------------------------------------------------------
// Document-level discriminator + allOf composition
// ---------------------------------------------------------------------------

/**
 * Returns the schema name a `$ref` points at when it targets
 * `#/components/schemas/<Name>`, or `undefined` otherwise.
 *
 * The walker only resolves intra-document refs and other allOf-base
 * patterns; refs into `definitions` (Swagger 2.0) are already rewritten
 * before this stage.
 */
function componentSchemaName(ref: unknown): string | undefined {
    if (typeof ref !== "string") return undefined;
    const prefix = "#/components/schemas/";
    if (!ref.startsWith(prefix)) return undefined;
    const name = ref.slice(prefix.length);
    return name.length > 0 ? name : undefined;
}

/**
 * Find every immediate `$ref` that an `allOf` array contains pointing
 * back at a `components/schemas/<Name>` entry. Used to discover
 * "Cat extends Pet"-style inheritance — the subtype's `allOf` lists
 * the base by `$ref` alongside its own local fields.
 */
function listAllOfBaseRefs(schema: Record<string, unknown>): string[] {
    const allOf = schema.allOf;
    if (!Array.isArray(allOf)) return [];
    const result: string[] = [];
    for (const entry of allOf) {
        if (!isObject(entry)) continue;
        const name = componentSchemaName(entry.$ref);
        if (name !== undefined) result.push(name);
    }
    return result;
}

interface DiscriminatorSubtype {
    /** Component name of the subtype, e.g. `"Cat"`. */
    name: string;
    /** Discriminator `const` value for this subtype. */
    constValue: string;
}

/**
 * Collect discriminator subtypes for a base schema. Entries come from:
 *
 * 1. The base's `discriminator.mapping` (explicit author intent — the
 *    mapping key supplies the `const` value, the ref names the subtype).
 * 2. Component schemas whose `allOf` lists this base by `$ref` and
 *    were not already named in the mapping. The `const` value defaults
 *    to the subtype's component name.
 *
 * Returned in deterministic order: mapping entries first (preserving
 * authored order), then implicit subtypes alphabetically.
 */
function collectDiscriminatorSubtypes(
    baseName: string,
    discriminator: Record<string, unknown>,
    componentSchemas: Record<string, unknown>
): DiscriminatorSubtype[] {
    const result: DiscriminatorSubtype[] = [];
    const seen = new Set<string>();

    const mapping = isObject(discriminator.mapping)
        ? discriminator.mapping
        : undefined;
    if (mapping !== undefined) {
        for (const [constValue, ref] of Object.entries(mapping)) {
            const name = componentSchemaName(ref);
            if (name === undefined) continue;
            if (!isObject(componentSchemas[name])) continue;
            if (seen.has(name)) continue;
            seen.add(name);
            result.push({ name, constValue });
        }
    }

    const implicitNames: string[] = [];
    for (const [name, schema] of Object.entries(componentSchemas)) {
        if (!isObject(schema)) continue;
        if (seen.has(name)) continue;
        if (!listAllOfBaseRefs(schema).includes(baseName)) continue;
        implicitNames.push(name);
    }
    implicitNames.sort();
    for (const name of implicitNames) {
        result.push({ name, constValue: name });
        seen.add(name);
    }

    return result;
}

/**
 * Inject the discriminator `const` on a subtype schema in-place.
 *
 * When the subtype already declares a matching const we leave it
 * alone. Otherwise the const is added in whichever location the walker
 * will actually observe:
 *
 * - Subtype declares `allOf`: append a new `allOf` entry carrying just
 *   `{ properties: { [propertyName]: { const } } }`. The walker's
 *   `mergeAllOf` merges every entry's `properties` into the resolved
 *   schema, so the const propagates through to the merged result. A
 *   top-level `properties` sibling of `allOf` would be ignored by the
 *   merge.
 * - Subtype does not declare `allOf`: extend the top-level `properties`
 *   block — the walker reads this directly.
 */
function injectSubtypeConst(
    subtype: Record<string, unknown>,
    propertyName: string,
    constValue: string
): void {
    if (subtypeAlreadyDeclaresConst(subtype, propertyName)) return;

    const constEntry: Record<string, unknown> = {
        properties: { [propertyName]: { const: constValue } },
    };

    if (Array.isArray(subtype.allOf)) {
        const existing: unknown[] = subtype.allOf;
        subtype.allOf = [...existing, constEntry];
        return;
    }

    const existingProps = isObject(subtype.properties)
        ? { ...subtype.properties }
        : {};
    const existingDisc = existingProps[propertyName];
    existingProps[propertyName] = {
        ...(isObject(existingDisc) ? existingDisc : {}),
        const: constValue,
    };
    subtype.properties = existingProps;
}

/**
 * Check whether a subtype (or any of its `allOf` entries) already
 * carries a `const` for the discriminator property. Used to avoid
 * overwriting an author-supplied const.
 */
function subtypeAlreadyDeclaresConst(
    subtype: Record<string, unknown>,
    propertyName: string
): boolean {
    if (hasConstProp(subtype.properties, propertyName)) return true;
    if (Array.isArray(subtype.allOf)) {
        for (const entry of subtype.allOf) {
            if (!isObject(entry)) continue;
            if (hasConstProp(entry.properties, propertyName)) return true;
        }
    }
    return false;
}

function hasConstProp(properties: unknown, propertyName: string): boolean {
    if (!isObject(properties)) return false;
    const prop = properties[propertyName];
    return isObject(prop) && "const" in prop;
}

/**
 * Strip every `$ref` entry in a subtype's `allOf` that targets the
 * discriminator base. The base's own schema content (properties,
 * required, type) is replicated into a synthesised `allOf` entry so
 * the subtype remains structurally complete — without this the base's
 * synthesised `oneOf` would cycle through the subtype's `$ref`s on
 * every walk (Dog → Pet.oneOf → Dog → ...).
 */
function rewriteSubtypeAllOf(
    subtype: Record<string, unknown>,
    baseName: string,
    baseInherited: Record<string, unknown>
): void {
    const allOf = subtype.allOf;
    if (!Array.isArray(allOf)) return;
    const baseRefPrefix = `#/components/schemas/${baseName}`;
    const rewritten: unknown[] = [];
    let removedBaseRef = false;
    for (const entry of allOf) {
        if (
            isObject(entry) &&
            typeof entry.$ref === "string" &&
            entry.$ref === baseRefPrefix
        ) {
            removedBaseRef = true;
            continue;
        }
        rewritten.push(entry);
    }
    if (!removedBaseRef) return;
    // Prepend the inherited base content so the subtype keeps the
    // base's properties/required/type without depending on the rewritten
    // base (which now carries `oneOf` instead of its original shape).
    subtype.allOf = [baseInherited, ...rewritten];
}

/**
 * Capture the "inheritable" portion of a base schema before rewriting:
 * `properties`, `required`, `type`, and any other constraint that
 * subtypes used to inherit through `$ref`. The discriminator keyword
 * and the synthesised `oneOf` are intentionally excluded — subtypes
 * never inherited those and including them would re-introduce the
 * Pet → Dog → Pet cycle.
 */
function captureBaseInherited(
    base: Record<string, unknown>
): Record<string, unknown> {
    const inherited: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(base)) {
        if (key === "discriminator") continue;
        if (key === "oneOf") continue;
        if (key === "anyOf") continue;
        inherited[key] = value;
    }
    return inherited;
}

/**
 * Build an inline `oneOf` option that targets a subtype via `$ref` and
 * carries the discriminator property's `const` at the option's top
 * level. The const sibling is what makes `detectDiscriminated` classify
 * the parent `oneOf` as a discriminated union — it inspects each
 * option's literal `properties`, not the resolved schema.
 */
function buildDiscriminatorOption(
    subtype: DiscriminatorSubtype,
    propertyName: string
): Record<string, unknown> {
    return {
        $ref: `#/components/schemas/${subtype.name}`,
        properties: {
            [propertyName]: { const: subtype.constValue },
        },
    };
}

/**
 * Document-level pre-pass for OpenAPI discriminators that are declared
 * on a base schema and inherited by subtypes via `allOf`.
 *
 * The per-node {@link normaliseOpenApi30Discriminator} only handles
 * discriminators that already sit alongside `oneOf`/`anyOf`. For the
 * canonical "Cat extends Pet" pattern — where `Pet` carries the
 * discriminator and `Cat`/`Dog` reference `Pet` via `allOf` — the
 * discriminator is silently lost. This pre-pass:
 *
 * 1. Injects the discriminator `const` on each subtype's local
 *    `properties` (so a direct render of the subtype validates the
 *    discriminator value correctly).
 * 2. Synthesises a `oneOf` on the base whenever it lacks one, listing
 *    each subtype as `{ $ref, properties: { propertyName: { const } } }`.
 *    The per-node discriminator transform then sees `oneOf` and clears
 *    the `discriminator` keyword, and the walker's
 *    `detectDiscriminated` finds the per-option `const`s.
 *
 * Mutates a shallow clone of `components/schemas` — the input document
 * is never modified.
 */
export function applyDiscriminatorAllOfPrepass(
    doc: Record<string, unknown>
): Record<string, unknown> {
    const components = doc.components;
    if (!isObject(components)) return doc;
    const schemas = components.schemas;
    if (!isObject(schemas)) return doc;

    // Plan first against the original document so additions to the
    // subtype map do not perturb sibling lookups mid-pass.
    interface Plan {
        baseName: string;
        propertyName: string;
        subtypes: DiscriminatorSubtype[];
        baseHasOneOfOrAnyOf: boolean;
        baseInherited: Record<string, unknown>;
    }
    const plans: Plan[] = [];
    for (const [baseName, base] of Object.entries(schemas)) {
        if (!isObject(base)) continue;
        const discriminator = base.discriminator;
        if (!isObject(discriminator)) continue;
        const propertyName = discriminator.propertyName;
        if (typeof propertyName !== "string") continue;
        const subtypes = collectDiscriminatorSubtypes(
            baseName,
            discriminator,
            schemas
        );
        if (subtypes.length === 0) continue;
        plans.push({
            baseName,
            propertyName,
            subtypes,
            baseHasOneOfOrAnyOf:
                Array.isArray(base.oneOf) || Array.isArray(base.anyOf),
            // Snapshot the base's inheritable content from the *original*
            // document. Subtype rewrites must inline the pre-rewrite
            // shape so the synthesised `oneOf` on the base never cycles
            // back through the subtype's `$ref`.
            baseInherited: captureBaseInherited(base),
        });
    }

    if (plans.length === 0) return doc;

    // Clone the schemas map and every schema we are about to touch.
    const newSchemas: Record<string, unknown> = { ...schemas };
    const cloneSchema = (name: string): Record<string, unknown> => {
        const existing = newSchemas[name];
        if (!isObject(existing)) {
            throw new Error(
                `applyDiscriminatorAllOfPrepass: schema "${name}" disappeared between planning and rewrite`
            );
        }
        const clone = { ...existing };
        newSchemas[name] = clone;
        return clone;
    };

    for (const plan of plans) {
        for (const subtype of plan.subtypes) {
            const clone = cloneSchema(subtype.name);
            // Break the `allOf` cycle first so injecting the const
            // operates on the rewritten allOf shape rather than the
            // original `$ref` chain.
            rewriteSubtypeAllOf(clone, plan.baseName, plan.baseInherited);
            injectSubtypeConst(clone, plan.propertyName, subtype.constValue);
        }
        if (!plan.baseHasOneOfOrAnyOf) {
            const baseClone = cloneSchema(plan.baseName);
            baseClone.oneOf = plan.subtypes.map((subtype) =>
                buildDiscriminatorOption(subtype, plan.propertyName)
            );
            // Remove the base's own `properties`/`required`/`type` — the
            // inherited shape now lives on each subtype, and leaving
            // them on the base would conflict with `oneOf` semantics
            // (allOf-style merge into a union branch).
            delete baseClone.properties;
            delete baseClone.required;
            delete baseClone.type;
        }
    }

    return {
        ...doc,
        components: { ...components, schemas: newSchemas },
    };
}

// ---------------------------------------------------------------------------
// Combined transform
// ---------------------------------------------------------------------------

/**
 * Combined OpenAPI 3.0.x node transform: Draft 04 + nullable + discriminator.
 * Applied to every schema node in an OpenAPI 3.0 document.
 *
 * Draft 04 normalisation is included because OpenAPI 3.0 inherits
 * Draft 04/05 schema semantics including `exclusiveMinimum: boolean`.
 */
export function normaliseOpenApi30Combined(
    node: Record<string, unknown>
): Record<string, unknown> {
    return normaliseOpenApi30Discriminator(
        normaliseOpenApi30Node(normaliseDraft04Node(node))
    );
}

// ---------------------------------------------------------------------------
// Deep document normalisation
// ---------------------------------------------------------------------------

/**
 * Per-schema normaliser supplied by the caller. Given a Schema Object,
 * returns the normalised (deep-cloned) Schema Object. The visitor is
 * agnostic to which transforms run inside.
 */
type SchemaNormaliser = (
    schema: Record<string, unknown>
) => Record<string, unknown>;

/**
 * Deep-clone the parent first, then patch back any keys whose values were
 * rewritten by the visitor. This preserves immutability of the original
 * document while keeping the visitor straightforward to write.
 */

/**
 * Deep-normalise every Schema Object in an OpenAPI document.
 *
 * Walks: `paths.*` (operations + path-level parameters), `webhooks.*`
 * (3.1), `components.schemas`, `components.parameters`,
 * `components.responses`, `components.requestBodies`,
 * `components.headers`, `components.callbacks`, `components.pathItems`
 * (3.1). For each Schema-bearing location, applies the supplied
 * `normaliseSchema` function.
 *
 * The walker is structural (it understands OAS document shapes) and
 * delegates the per-schema transformation. For OAS 3.0 the caller
 * passes a full Draft 04 + nullable + discriminator + example
 * normaliser; for OAS 3.1 the caller passes a discriminator-only
 * normaliser so the walker's discriminated-union detection sees the
 * injected `const`s regardless of OAS minor version.
 */
export function deepNormaliseOpenApiDoc(
    doc: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...doc };

    // Components
    const components = doc.components;
    if (isObject(components)) {
        result.components = normaliseComponents(components, normaliseSchema);
    }

    // Paths
    const paths = doc.paths;
    if (isObject(paths)) {
        result.paths = normalisePathMap(paths, normaliseSchema);
    }

    // Webhooks (OpenAPI 3.1)
    const webhooks = doc.webhooks;
    if (isObject(webhooks)) {
        result.webhooks = normalisePathMap(webhooks, normaliseSchema);
    }

    return result;
}

/**
 * Backwards-compatible wrapper retaining the historic `deepNormalise`
 * signature used by callers in `normalise.ts`. Always applies the full
 * 3.0 combined transform via `deepNormalise(schema, normaliseOpenApi30Combined)`.
 */
export function deepNormaliseOpenApi30Doc(
    doc: Record<string, unknown>,
    deepNormalise: (
        schema: Record<string, unknown>,
        transform: NodeTransform
    ) => Record<string, unknown>
): Record<string, unknown> {
    return deepNormaliseOpenApiDoc(doc, (schema) =>
        deepNormalise(schema, normaliseOpenApi30Combined)
    );
}

// ---------------------------------------------------------------------------
// Components container
// ---------------------------------------------------------------------------

function normaliseComponents(
    components: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...components };

    // components/schemas — direct Schema Objects
    const schemas = components.schemas;
    if (isObject(schemas)) {
        result.schemas = mapObjectValues(schemas, (schema) =>
            isObject(schema) ? normaliseSchema(schema) : schema
        );
    }

    // components/parameters — Parameter Objects
    const parameters = components.parameters;
    if (isObject(parameters)) {
        result.parameters = mapObjectValues(parameters, (param) =>
            isObject(param) ? normaliseParameter(param, normaliseSchema) : param
        );
    }

    // components/responses — Response Objects
    const responses = components.responses;
    if (isObject(responses)) {
        result.responses = mapObjectValues(responses, (response) =>
            isObject(response)
                ? normaliseResponse(response, normaliseSchema)
                : response
        );
    }

    // components/requestBodies — Request Body Objects
    const requestBodies = components.requestBodies;
    if (isObject(requestBodies)) {
        result.requestBodies = mapObjectValues(requestBodies, (body) =>
            isObject(body) ? normaliseRequestBody(body, normaliseSchema) : body
        );
    }

    // components/headers — Header Objects
    const headers = components.headers;
    if (isObject(headers)) {
        result.headers = mapObjectValues(headers, (header) =>
            isObject(header) ? normaliseHeader(header, normaliseSchema) : header
        );
    }

    // components/callbacks — Callback Objects (map of expression → Path Item)
    const callbacks = components.callbacks;
    if (isObject(callbacks)) {
        result.callbacks = mapObjectValues(callbacks, (callback) =>
            isObject(callback)
                ? normaliseCallback(callback, normaliseSchema)
                : callback
        );
    }

    // components/pathItems (OpenAPI 3.1) — Path Item Objects
    const pathItems = components.pathItems;
    if (isObject(pathItems)) {
        result.pathItems = mapObjectValues(pathItems, (pathItem) =>
            isObject(pathItem)
                ? normalisePathItem(pathItem, normaliseSchema)
                : pathItem
        );
    }

    // components/links and components/examples carry no Schema Objects —
    // pass through untouched. components/securitySchemes likewise.

    return result;
}

// ---------------------------------------------------------------------------
// Path map (paths and webhooks share the same shape)
// ---------------------------------------------------------------------------

function normalisePathMap(
    paths: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    return mapObjectValues(paths, (pathItem) =>
        isObject(pathItem)
            ? normalisePathItem(pathItem, normaliseSchema)
            : pathItem
    );
}

// ---------------------------------------------------------------------------
// Path Item / Operation
// ---------------------------------------------------------------------------

const HTTP_METHODS = [
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace",
] as const;

function normalisePathItem(
    pathItem: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...pathItem };

    for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        if (isObject(operation)) {
            result[method] = normaliseOperation(operation, normaliseSchema);
        }
    }

    // Path-level parameters
    const parameters = pathItem.parameters;
    if (Array.isArray(parameters)) {
        result.parameters = parameters.map((param: unknown) =>
            isObject(param) ? normaliseParameter(param, normaliseSchema) : param
        );
    }

    return result;
}

function normaliseOperation(
    operation: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...operation };

    // Parameters
    const parameters = operation.parameters;
    if (Array.isArray(parameters)) {
        result.parameters = parameters.map((param: unknown) =>
            isObject(param) ? normaliseParameter(param, normaliseSchema) : param
        );
    }

    // Request body
    const requestBody = operation.requestBody;
    if (isObject(requestBody)) {
        result.requestBody = normaliseRequestBody(requestBody, normaliseSchema);
    }

    // Responses
    const responses = operation.responses;
    if (isObject(responses)) {
        result.responses = mapObjectValues(responses, (response) =>
            isObject(response)
                ? normaliseResponse(response, normaliseSchema)
                : response
        );
    }

    // Callbacks
    const callbacks = operation.callbacks;
    if (isObject(callbacks)) {
        result.callbacks = mapObjectValues(callbacks, (callback) =>
            isObject(callback)
                ? normaliseCallback(callback, normaliseSchema)
                : callback
        );
    }

    return result;
}

// ---------------------------------------------------------------------------
// Parameter
// ---------------------------------------------------------------------------

function normaliseParameter(
    param: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...param };

    const schema = param.schema;
    if (isObject(schema)) {
        result.schema = normaliseSchema(schema);
    }

    // Parameter may carry `content.*` instead of `schema` (OAS 3.0+)
    const content = param.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content, normaliseSchema);
    }

    // Normalise example → examples on the parameter itself
    if ("example" in result && !("examples" in result)) {
        result.examples = [result.example];
        delete result.example;
    } else if ("example" in result) {
        delete result.example;
    }
    return result;
}

// ---------------------------------------------------------------------------
// Request Body
// ---------------------------------------------------------------------------

function normaliseRequestBody(
    requestBody: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...requestBody };
    const content = requestBody.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content, normaliseSchema);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

function normaliseResponse(
    response: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...response };

    const content = response.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content, normaliseSchema);
    }

    // Response headers — each header has its own schema
    const headers = response.headers;
    if (isObject(headers)) {
        result.headers = mapObjectValues(headers, (header) =>
            isObject(header) ? normaliseHeader(header, normaliseSchema) : header
        );
    }

    // Response links carry no Schema Objects (parameters are runtime
    // expressions, not schemas). Leave them untouched.

    return result;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function normaliseHeader(
    header: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...header };

    const schema = header.schema;
    if (isObject(schema)) {
        result.schema = normaliseSchema(schema);
    }

    const content = header.content;
    if (isObject(content)) {
        result.content = normaliseContentMap(content, normaliseSchema);
    }

    // Normalise example → examples on the header itself
    if ("example" in result && !("examples" in result)) {
        result.examples = [result.example];
        delete result.example;
    } else if ("example" in result) {
        delete result.example;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

/**
 * A Callback Object is a map of runtime-expression keys → Path Item
 * Objects. Each Path Item carries operations whose responses, request
 * bodies, parameters, and headers may all contain Schema Objects.
 */
function normaliseCallback(
    callback: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    return mapObjectValues(callback, (pathItem) =>
        isObject(pathItem)
            ? normalisePathItem(pathItem, normaliseSchema)
            : pathItem
    );
}

// ---------------------------------------------------------------------------
// Media Type / Content map / Encoding
// ---------------------------------------------------------------------------

function normaliseContentMap(
    content: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [mediaType, mediaObj] of Object.entries(content)) {
        if (!isObject(mediaObj)) {
            result[mediaType] = mediaObj;
            continue;
        }
        const normalised: Record<string, unknown> = { ...mediaObj };
        const schema = mediaObj.schema;
        if (isObject(schema)) {
            normalised.schema = normaliseSchema(schema);
        }
        // Encoding objects within a media type carry their own headers
        const encoding = mediaObj.encoding;
        if (isObject(encoding)) {
            normalised.encoding = mapObjectValues(encoding, (enc) =>
                isObject(enc) ? normaliseEncoding(enc, normaliseSchema) : enc
            );
        }
        // Normalise example → examples on the media type object.
        //
        // OpenAPI 3.0 defines Media Type Object's `examples` as
        // `Map[string, Example Object | Reference Object]`, where each
        // Example Object carries `summary`, `description`, `value`,
        // `externalValue`. A bare `{ value: example }` would be parsed as
        // a single Example Object instead of a map of them — incorrect per
        // the spec. Wrap the value under a synthetic `default` key so the
        // resulting structure is a valid Map of one Example Object.
        if ("example" in normalised && !("examples" in normalised)) {
            normalised.examples = {
                default: { value: normalised.example },
            };
            delete normalised.example;
        } else if ("example" in normalised) {
            delete normalised.example;
        }
        result[mediaType] = normalised;
    }
    return result;
}

function normaliseEncoding(
    encoding: Record<string, unknown>,
    normaliseSchema: SchemaNormaliser
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...encoding };
    const headers = encoding.headers;
    if (isObject(headers)) {
        result.headers = mapObjectValues(headers, (header) =>
            isObject(header) ? normaliseHeader(header, normaliseSchema) : header
        );
    }
    return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply `transform` to each value of a `Record<string, unknown>` and
 * return a new record. Non-object values pass through transform unchanged
 * — callers add their own `isObject` guard inside `transform`.
 */
function mapObjectValues(
    source: Record<string, unknown>,
    transform: (value: unknown) => unknown
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        result[key] = transform(value);
    }
    return result;
}
