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
        // Normalise example → examples on the media type object
        if ("example" in normalised && !("examples" in normalised)) {
            normalised.examples = { value: normalised.example };
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
