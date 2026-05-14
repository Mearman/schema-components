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
import type { OperationInfo, ParameterInfo, ResponseInfo } from "./parser.ts";
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
import { toRecordOrUndefined } from "../core/guards.ts";
import { SchemaNormalisationError } from "../core/errors.ts";
import {
    toDoc,
    resolveOperation,
    resolveParameters,
    resolveRequestBody,
    resolveResponse,
} from "./resolve.ts";

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
    }
): ReactNode {
    let jsonSchema: Record<string, unknown>;
    let rootMeta: SchemaMeta | undefined;
    try {
        const normalised = normaliseSchema(schema);
        jsonSchema = normalised.jsonSchema;
        rootMeta = normalised.rootMeta;
    } catch (err: unknown) {
        throw new SchemaNormalisationError(
            err instanceof Error ? err.message : "Failed to normalise schema",
            schema,
            "unknown"
        );
    }

    const componentMeta: SchemaMeta = {};
    if (options.readOnly === true) componentMeta.readOnly = true;
    if (options.meta !== undefined) {
        for (const [k, v] of Object.entries(options.meta)) {
            componentMeta[k] = v;
        }
    }

    const walkOpts: import("../core/walker.ts").WalkOptions = {
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
    const rootDoc = toDoc(doc);
    const resolved = resolveOperation(rootDoc, path, method);

    return (
        <section data-operation={`${method.toUpperCase()} ${path}`}>
            <OperationHeader operation={resolved.operation} />
            {resolved.parameters.length > 0 && (
                <section data-parameters>
                    <h4>Parameters</h4>
                    <ParameterList
                        parameters={resolved.parameters}
                        rootDoc={rootDoc}
                        meta={meta}
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
    const rootDoc = toDoc(doc);
    const params = resolveParameters(rootDoc, path, method);

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
    const rootDoc = toDoc(doc);
    const requestBody = resolveRequestBody(rootDoc, path, method);

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
    const rootDoc = toDoc(doc);
    const response = resolveResponse(rootDoc, path, method, status);

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

// Need walk imported for renderSchema
import { walk } from "../core/walker.ts";
