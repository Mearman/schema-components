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

import type { ReactNode } from "react";
import {
    parseOpenApiDocument,
    listOperations,
    getParameters,
    getRequestBody,
    getResponses,
    type OpenApiDocument,
    type OperationInfo,
    type ParameterInfo,
    type ResponseInfo,
} from "../openapi/parser.ts";
import { walk, type WalkOptions } from "../core/walker.ts";
import { normaliseSchema } from "../core/adapter.ts";
import { renderField } from "../react/SchemaComponent.tsx";
import type {
    FieldOverride,
    InferParameterOverrides,
    InferRequestBodyFields,
    InferResponseFields,
    SchemaMeta,
    WalkedField,
} from "../core/types.ts";

// ---------------------------------------------------------------------------
// Document caching
// ---------------------------------------------------------------------------

const docCache = new WeakMap<object, OpenApiDocument>();

function getParsed(doc: Record<string, unknown>): OpenApiDocument {
    const cached = docCache.get(doc);
    if (cached !== undefined) return cached;
    const parsed = parseOpenApiDocument(doc);
    docCache.set(doc, parsed);
    return parsed;
}

function noop() {
    /* intentional no-op */
}

function isDoc(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDoc(value: unknown): Record<string, unknown> {
    if (isDoc(value)) return value;
    return {};
}

// ---------------------------------------------------------------------------
// Internal: render a JSON Schema directly (walker + renderField)
// ---------------------------------------------------------------------------

function renderSchema(
    schema: unknown,
    rootDocument: Record<string, unknown>,
    options: {
        value?: unknown;
        onChange?: ((value: unknown) => void) | undefined;
        fields?: unknown;
        meta?: SchemaMeta | undefined;
        readOnly?: boolean | undefined;
    }
): ReactNode {
    let jsonSchema: Record<string, unknown>;
    let rootMeta: SchemaMeta | undefined;
    try {
        const normalised = normaliseSchema(schema);
        jsonSchema = normalised.jsonSchema;
        rootMeta = normalised.rootMeta;
    } catch {
        return <div>Unable to parse schema</div>;
    }

    const componentMeta: SchemaMeta = {};
    if (options.readOnly === true) componentMeta.readOnly = true;
    if (options.meta !== undefined) {
        for (const [k, v] of Object.entries(options.meta)) {
            componentMeta[k] = v;
        }
    }

    const walkOpts: WalkOptions = {
        componentMeta,
        rootMeta,
        fieldOverrides: toRecordOrUndefined(options.fields),
        rootDocument,
    };

    const tree = walk(jsonSchema, walkOpts);

    const renderChild = (
        childTree: WalkedField,
        childValue: unknown,
        childOnChange: (v: unknown) => void
    ): ReactNode =>
        renderField(
            childTree,
            childValue,
            childOnChange,
            undefined,
            renderChild
        );

    return renderField(
        tree,
        options.value,
        options.onChange ?? noop,
        undefined,
        renderChild
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
}: ApiOperationProps<Doc, Path, Method>): ReactNode {
    const parsed = getParsed(toDoc(doc));
    const rootDoc = toDoc(doc);

    const operations = listOperations(parsed);
    const operation = operations.find(
        (op) => op.path === path && op.method === method
    );

    if (operation === undefined) {
        return (
            <div>
                Operation not found: {method.toUpperCase()} {path}
            </div>
        );
    }

    const params = getParameters(parsed, path, method);
    const requestBody = getRequestBody(parsed, path, method);
    const responses = getResponses(parsed, path, method);

    return (
        <section data-operation={`${method.toUpperCase()} ${path}`}>
            <OperationHeader operation={operation} />
            {params.length > 0 && (
                <section data-parameters>
                    <h4>Parameters</h4>
                    <ParameterList
                        parameters={params}
                        rootDoc={rootDoc}
                        meta={meta}
                    />
                </section>
            )}
            {requestBody?.schema !== undefined && (
                <section data-request-body>
                    <h4>
                        Request Body
                        {requestBody.required && <span data-required>*</span>}
                    </h4>
                    {requestBody.description && (
                        <p>{requestBody.description}</p>
                    )}
                    {requestBody.contentTypes.length > 0 && (
                        <span data-content-type>
                            {requestBody.contentTypes[0]}
                        </span>
                    )}
                    {renderSchema(requestBody.schema, rootDoc, {
                        value: requestBodyValue,
                        onChange: onRequestBodyChange,
                        fields: requestBodyFields,
                        meta,
                    })}
                </section>
            )}
            {responses.length > 0 && (
                <section data-responses>
                    <h4>Responses</h4>
                    {responses.map((response) => (
                        <ResponseCard
                            key={response.statusCode}
                            response={response}
                            rootDoc={rootDoc}
                            value={responseValue}
                            meta={meta}
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
}: ApiParametersProps<Doc, Path, Method>): ReactNode {
    const parsed = getParsed(toDoc(doc));
    const rootDoc = toDoc(doc);
    const params = getParameters(parsed, path, method);

    if (params.length === 0) return null;

    return (
        <section data-parameters>
            <h4>Parameters</h4>
            <ParameterList
                parameters={params}
                rootDoc={rootDoc}
                overrides={overrides}
                meta={meta}
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
}: ApiRequestBodyProps<Doc, Path, Method>): ReactNode {
    const parsed = getParsed(toDoc(doc));
    const rootDoc = toDoc(doc);
    const requestBody = getRequestBody(parsed, path, method);

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
}: ApiResponseProps<Doc, Path, Method, Status>): ReactNode {
    const parsed = getParsed(toDoc(doc));
    const rootDoc = toDoc(doc);
    const responses = getResponses(parsed, path, method);
    const response = responses.find((r) => r.statusCode === status);

    if (response === undefined) {
        return <div>Response not found: {status}</div>;
    }

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
            {operation.deprecated && <span data-deprecated>Deprecated</span>}
        </header>
    );
}

function ParameterList({
    parameters,
    rootDoc,
    overrides,
    meta,
}: {
    parameters: ParameterInfo[];
    rootDoc: Record<string, unknown>;
    overrides?: unknown;
    meta?: SchemaMeta | undefined;
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
}: {
    response: ResponseInfo;
    rootDoc: Record<string, unknown>;
    value?: unknown;
    fields?: unknown;
    meta?: SchemaMeta | undefined;
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

    return (
        <div data-status={response.statusCode}>
            <h5>{response.statusCode}</h5>
            {response.description && <p>{response.description}</p>}
            {renderSchema(response.schema, rootDoc, {
                value,
                fields,
                meta: { readOnly: true, ...meta },
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRecordOrUndefined(
    value: unknown
): Record<string, unknown> | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        result[k] = v;
    }
    return result;
}

function buildParamMeta(
    param: ParameterInfo,
    overrides: unknown,
    meta: SchemaMeta | undefined
): SchemaMeta | undefined {
    const result: SchemaMeta = {};
    if (param.description !== undefined) result.description = param.description;
    if (param.deprecated) result.deprecated = true;
    const override = getFieldOverride(overrides, param.name);
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

function getFieldOverride(
    overrides: unknown,
    name: string
): Record<string, unknown> | undefined {
    if (typeof overrides !== "object" || overrides === null) return undefined;
    const value = toDoc(overrides)[name];
    if (typeof value !== "object" || value === null) return undefined;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        result[k] = v;
    }
    return result;
}
