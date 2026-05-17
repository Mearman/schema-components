/**
 * OpenAPI React components with type-safe generics.
 *
 * Render API operations, parameters, request bodies, and response schemas
 * from OpenAPI 3.x documents. When the document is typed `as const`,
 * the `fields` / `overrides` props get full autocomplete.
 *
 * Type safety is enforced at the outer component's props level via
 * conditional types (InferRequestBodyFields, InferResponseFields,
 * InferParameterOverrides). Internally, schemas are extracted and
 * rendered via the walker + headless resolver directly, bypassing
 * SchemaComponent to avoid deferred-conditional-type compatibility issues.
 */

import { useId, type ReactNode } from "react";
import type { OperationInfo, ParameterInfo, ResponseInfo } from "./parser.ts";
import {
    listCallbacks,
    getSecurityRequirements,
    getSecuritySchemes,
    getLinks,
} from "./parser.ts";
import { walk } from "../core/walker.ts";
import {
    joinPath,
    renderField,
    sanitisePrefix,
} from "../react/SchemaComponent.tsx";
import type { FieldOverride, SchemaMeta, WalkedField } from "../core/types.ts";
import type {
    InferParameterOverrides,
    InferRequestBodyFields,
    InferResponseFields,
    UnsafeFields,
} from "../core/typeInference.ts";
import { isObject, toRecordOrUndefined } from "../core/guards.ts";
import {
    toDoc,
    resolveOperation,
    resolveParameters,
    resolveRequestBody,
    resolveResponse,
    getParsed,
} from "./resolve.ts";
import type { WidgetMap } from "../react/SchemaComponent.tsx";
import { ApiSecurity } from "./ApiSecurity.tsx";
import { ApiCallbacks } from "./ApiCallbacks.tsx";
import { ApiLinks } from "./ApiLinks.tsx";
import { ApiResponseHeaders } from "./ApiResponseHeaders.tsx";

// ---------------------------------------------------------------------------
// Internal: render a JSON Schema directly (walker + renderField)
// ---------------------------------------------------------------------------

function noop() {
    /* intentional no-op */
}

function renderSchema(
    schema: unknown,
    rootDocument: Record<string, unknown>,
    options: {
        value?: unknown;
        onChange?: ((value: unknown) => void) | undefined;
        fields?: unknown;
        meta?: SchemaMeta | undefined;
        readOnly?: boolean | undefined;
        widgets?: WidgetMap | undefined;
        /**
         * Per-call root path. Callers must derive a unique value (typically
         * `useId()` joined with a route token) so generated DOM ids stay
         * unique when multiple operations render side-by-side.
         */
        rootPath: string;
    }
): ReactNode {
    // The schema arrives already normalised — `getParsed` in resolve.ts
    // runs the input document through `normaliseOpenApiSchemas` before
    // parsing, so OpenAPI 3.0 keywords (nullable, discriminator, example)
    // and Swagger 2.0 structure have already been converted to canonical
    // Draft 2020-12 form. Extract the schema and root meta directly.
    if (!isObject(schema)) {
        throw new Error(
            "renderSchema received a non-object schema from the resolver."
        );
    }

    const rootMeta = extractRootMetaFromSchema(schema);

    const componentMeta: SchemaMeta = {};
    if (options.readOnly === true) componentMeta.readOnly = true;
    if (options.meta !== undefined) {
        for (const [k, v] of Object.entries(options.meta)) {
            componentMeta[k] = v;
        }
    }

    const walkOpts: import("../core/walkBuilders.ts").WalkOptions = {
        componentMeta,
        rootMeta,
        fieldOverrides: toRecordOrUndefined(options.fields),
        rootDocument,
    };

    const tree = walk(schema, walkOpts);

    const makeRenderChild =
        (parentPath: string) =>
        (
            childTree: WalkedField,
            childValue: unknown,
            childOnChange: (v: unknown) => void,
            pathSuffix?: string
        ): ReactNode => {
            const childPath = joinPath(parentPath, pathSuffix);
            return renderField(
                childTree,
                childValue,
                childOnChange,
                undefined,
                makeRenderChild(childPath),
                childPath,
                options.widgets
            );
        };

    return renderField(
        tree,
        options.value,
        options.onChange ?? noop,
        undefined,
        makeRenderChild(options.rootPath),
        options.rootPath,
        options.widgets
    );
}

// ---------------------------------------------------------------------------
// <ApiOperation>
// ---------------------------------------------------------------------------

export interface ApiOperationProps<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
> {
    schema: Doc;
    path: Path;
    method: Method;
    requestBodyValue?: unknown;
    onRequestBodyChange?: (value: unknown) => void;
    responseValue?: unknown;
    meta?: SchemaMeta;
    requestBodyFields?: Doc extends Record<string, unknown>
        ? InferRequestBodyFields<Doc, Path, Method>
        : Record<string, FieldOverride>;
    /** Escape hatch for recursive schemas where type-level inference fails.
     * Typed as Record<string, FieldOverride> — use when the schema contains
     * deeply nested $ref chains.
     */
    unsafeFields?: UnsafeFields;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

export function ApiOperation<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
>({
    schema: doc,
    path,
    method,
    requestBodyValue,
    onRequestBodyChange,
    responseValue,
    meta,
    requestBodyFields,
    widgets,
}: ApiOperationProps<Doc, Path, Method>): ReactNode {
    const rootDoc = toDoc(doc);
    const resolved = resolveOperation(rootDoc, path, method);
    const parsed = getParsed(rootDoc);
    const securityReqs = getSecurityRequirements(parsed, path, method);
    const securitySchemes = getSecuritySchemes(parsed);
    const callbacks = listCallbacks(parsed, path, method);
    const instancePrefix = sanitisePrefix(useId());

    return (
        <section data-operation={`${method.toUpperCase()} ${path}`}>
            <OperationHeader operation={resolved.operation} />
            <ApiSecurity
                requirements={securityReqs}
                schemes={securitySchemes}
            />
            <ApiCallbacks callbacks={callbacks} />
            {resolved.parameters.length > 0 && (
                <section data-parameters>
                    <h4>Parameters</h4>
                    <ParameterList
                        parameters={resolved.parameters}
                        rootDoc={rootDoc}
                        meta={meta}
                        widgets={widgets}
                        idPrefix={joinPath(instancePrefix, "params")}
                    />
                </section>
            )}
            {resolved.requestBody?.schema !== undefined && (
                <section data-request-body>
                    <h4>
                        Request Body
                        {resolved.requestBody.required && (
                            <span data-required>*</span>
                        )}
                    </h4>
                    {resolved.requestBody.description && (
                        <p>{resolved.requestBody.description}</p>
                    )}
                    {resolved.requestBody.contentTypes.length > 0 && (
                        <span data-content-type>
                            {resolved.requestBody.contentTypes[0]}
                        </span>
                    )}
                    {renderSchema(resolved.requestBody.schema, rootDoc, {
                        value: requestBodyValue,
                        onChange: onRequestBodyChange,
                        fields: requestBodyFields,
                        meta,
                        widgets,
                        rootPath: joinPath(instancePrefix, "requestBody"),
                    })}
                </section>
            )}
            {resolved.responses.length > 0 && (
                <section data-responses>
                    <h4>Responses</h4>
                    {resolved.responses.map((response) => (
                        <ResponseCard
                            key={response.statusCode}
                            response={response}
                            rootDoc={rootDoc}
                            value={responseValue}
                            meta={meta}
                            widgets={widgets}
                            path={path}
                            method={method}
                            idPrefix={joinPath(
                                instancePrefix,
                                `response-${response.statusCode}`
                            )}
                        />
                    ))}
                </section>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// <ApiParameters>
// ---------------------------------------------------------------------------

export interface ApiParametersProps<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
> {
    schema: Doc;
    path: Path;
    method: Method;
    meta?: SchemaMeta;
    overrides?: Doc extends Record<string, unknown>
        ? InferParameterOverrides<Doc, Path, Method>
        : Record<string, FieldOverride>;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

export function ApiParameters<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
>({
    schema: doc,
    path,
    method,
    meta,
    overrides,
    widgets,
}: ApiParametersProps<Doc, Path, Method>): ReactNode {
    const rootDoc = toDoc(doc);
    const params = resolveParameters(rootDoc, path, method);
    const instancePrefix = sanitisePrefix(useId());

    if (params.length === 0) return null;

    return (
        <section data-parameters>
            <h4>Parameters</h4>
            <ParameterList
                parameters={params}
                rootDoc={rootDoc}
                overrides={overrides}
                meta={meta}
                widgets={widgets}
                idPrefix={instancePrefix}
            />
        </section>
    );
}

// ---------------------------------------------------------------------------
// <ApiRequestBody>
// ---------------------------------------------------------------------------

export interface ApiRequestBodyProps<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
> {
    schema: Doc;
    path: Path;
    method: Method;
    value?: unknown;
    onChange?: (value: unknown) => void;
    meta?: SchemaMeta;
    fields?: Doc extends Record<string, unknown>
        ? InferRequestBodyFields<Doc, Path, Method>
        : Record<string, FieldOverride>;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

export function ApiRequestBody<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
>({
    schema: doc,
    path,
    method,
    value,
    onChange,
    meta,
    fields,
    widgets,
}: ApiRequestBodyProps<Doc, Path, Method>): ReactNode {
    const rootDoc = toDoc(doc);
    const requestBody = resolveRequestBody(rootDoc, path, method);
    const instancePrefix = sanitisePrefix(useId());

    if (requestBody?.schema === undefined) {
        return null;
    }

    return (
        <section data-request-body>
            <h4>
                Request Body
                {requestBody.required && <span data-required>*</span>}
            </h4>
            {requestBody.description && <p>{requestBody.description}</p>}
            {requestBody.contentTypes.length > 0 && (
                <span data-content-type>{requestBody.contentTypes[0]}</span>
            )}
            {renderSchema(requestBody.schema, rootDoc, {
                value,
                onChange,
                fields,
                meta,
                widgets,
                rootPath: instancePrefix,
            })}
        </section>
    );
}

// ---------------------------------------------------------------------------
// <ApiResponse>
// ---------------------------------------------------------------------------

export interface ApiResponseProps<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
    Status extends string = string,
> {
    schema: Doc;
    path: Path;
    method: Method;
    status: Status;
    value?: unknown;
    meta?: SchemaMeta;
    fields?: Doc extends Record<string, unknown>
        ? InferResponseFields<Doc, Path, Method, Status>
        : Record<string, FieldOverride>;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

export function ApiResponse<
    Doc = unknown,
    Path extends string = string,
    Method extends string = string,
    Status extends string = string,
>({
    schema: doc,
    path,
    method,
    status,
    value,
    meta,
    fields,
    widgets,
}: ApiResponseProps<Doc, Path, Method, Status>): ReactNode {
    const rootDoc = toDoc(doc);
    const response = resolveResponse(rootDoc, path, method, status);
    const instancePrefix = sanitisePrefix(useId());

    if (response.schema === undefined) {
        return (
            <div data-status={status}>
                <h4>{status}</h4>
                {response.description && <p>{response.description}</p>}
                <p>
                    <em>No schema</em>
                </p>
            </div>
        );
    }

    return (
        <ResponseCard
            response={response}
            rootDoc={rootDoc}
            value={value}
            fields={fields}
            meta={meta}
            widgets={widgets}
            path={path}
            method={method}
            idPrefix={instancePrefix}
        />
    );
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function OperationHeader({
    operation,
}: {
    operation: OperationInfo;
}): ReactNode {
    return (
        <header>
            <h3>
                {operation.method.toUpperCase()} {operation.path}
            </h3>
            {operation.summary && <p>{operation.summary}</p>}
            {operation.description && (
                <p data-description>{operation.description}</p>
            )}
            {operation.deprecated && <span data-deprecated>Deprecated</span>}
        </header>
    );
}

function ParameterList({
    parameters,
    rootDoc,
    overrides,
    meta,
    widgets,
    idPrefix,
}: {
    parameters: ParameterInfo[];
    rootDoc: Record<string, unknown>;
    overrides?: unknown;
    meta?: SchemaMeta | undefined;
    widgets?: WidgetMap | undefined;
    idPrefix: string;
}): ReactNode {
    return (
        <>
            {parameters.map((param) => (
                <div key={param.name} data-parameter={param.name}>
                    <label>
                        {param.name}
                        {param.required && <span data-required>*</span>}
                    </label>
                    {param.description && (
                        <span data-description>{param.description}</span>
                    )}
                    {renderSchema(param.schema ?? { type: "string" }, rootDoc, {
                        meta: buildParamMeta(param, overrides, meta),
                        widgets,
                        rootPath: joinPath(idPrefix, param.name),
                    })}
                </div>
            ))}
        </>
    );
}

function ResponseCard({
    response,
    rootDoc,
    value,
    fields,
    meta,
    widgets,
    path,
    method,
    idPrefix,
}: {
    response: ResponseInfo;
    rootDoc: Record<string, unknown>;
    value?: unknown;
    fields?: unknown;
    meta?: SchemaMeta | undefined;
    widgets?: WidgetMap | undefined;
    path?: string;
    method?: string;
    idPrefix: string;
}): ReactNode {
    if (response.schema === undefined) {
        return (
            <div data-status={response.statusCode}>
                <h5>{response.statusCode}</h5>
                {response.description && <p>{response.description}</p>}
                <p>
                    <em>No schema</em>
                </p>
            </div>
        );
    }

    // Get links for this response if we have path/method context.
    // `getLinks` returns `[]` for the no-links case, so any exception
    // bubbling out is a genuine bug (e.g. malformed parser state) — let it
    // propagate rather than silencing it with an empty array.
    let links: import("./parser.ts").LinkInfo[] = [];
    if (path !== undefined && method !== undefined) {
        const parsed = getParsed(rootDoc);
        links = getLinks(parsed, path, method, response.statusCode);
    }

    return (
        <div data-status={response.statusCode}>
            <h5>{response.statusCode}</h5>
            {response.description && <p>{response.description}</p>}
            {renderSchema(response.schema, rootDoc, {
                value,
                fields,
                meta: { readOnly: true, ...meta },
                widgets,
                rootPath: idPrefix,
            })}
            <ApiResponseHeaders headers={response.headers} />
            <ApiLinks links={links} />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParamMeta(
    param: ParameterInfo,
    overrides: unknown,
    meta: SchemaMeta | undefined
): SchemaMeta | undefined {
    const result: SchemaMeta = {};
    if (param.description !== undefined) result.description = param.description;
    if (param.deprecated) result.deprecated = true;
    const override = toRecordOrUndefined(
        toRecordOrUndefined(overrides)?.[param.name]
    );
    if (override !== undefined) {
        for (const [k, v] of Object.entries(override)) {
            result[k] = v;
        }
    }
    if (meta !== undefined) {
        for (const [k, v] of Object.entries(meta)) {
            result[k] = v;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Extract root-level meta (title, description, readOnly, etc.) from a
 * JSON Schema node. Mirrors `extractRootMetaFromJson` in the adapter so
 * pre-normalised schemas (extracted from `getParsed`) still surface root
 * meta to the walker without an extra adapter round-trip.
 */
function extractRootMetaFromSchema(
    jsonSchema: Record<string, unknown>
): SchemaMeta | undefined {
    const meta: SchemaMeta = {};
    if (jsonSchema.readOnly === true) meta.readOnly = true;
    if (jsonSchema.writeOnly === true) meta.writeOnly = true;
    if (typeof jsonSchema.description === "string")
        meta.description = jsonSchema.description;
    if (typeof jsonSchema.title === "string") meta.title = jsonSchema.title;
    if (typeof jsonSchema.deprecated === "boolean")
        meta.deprecated = jsonSchema.deprecated;
    return Object.keys(meta).length > 0 ? meta : undefined;
}
