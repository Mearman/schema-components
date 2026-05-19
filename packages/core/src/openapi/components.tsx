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
    extractSecurityRequirements,
    extractSecuritySchemes,
    extractLinks,
    listWebhooks,
    extractExternalDocs,
    extractXmlInfo,
    type ExternalDocs,
    type XmlInfo,
} from "./parser.ts";
import type { PathItemInfo } from "./resolve.ts";
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
    OpenAPIRequestBodyType,
    OpenAPIResponseType,
} from "../core/typeInference.ts";
import { isObject, toRecordOrUndefined } from "../core/guards.ts";
import { isSafeHyperlink } from "../core/uri.ts";
import {
    toDoc,
    resolveOperation,
    resolveParameters,
    resolveRequestBody,
    resolveResponse,
    getParsed,
} from "./resolve.ts";
import type { WidgetMap } from "../core/renderer.ts";
import { ApiSecurity } from "./ApiSecurity.tsx";
import { ApiCallbacks } from "./ApiCallbacks.tsx";
import { ApiLinks } from "./ApiLinks.tsx";
import { ApiResponseHeaders } from "./ApiResponseHeaders.tsx";
import type {
    DiagnosticSink,
    DiagnosticsOptions,
} from "../core/diagnostics.ts";
import { emitDiagnostic } from "../core/diagnostics.ts";
import { extractRootMetaFromJson } from "../core/adapter.ts";
import type { WalkOptions } from "../core/walkBuilders.ts";
import type { LinkInfo, OpenApiDocument } from "./parser.ts";

// ---------------------------------------------------------------------------
// Path / Method / Status / ContentType narrowing helpers
// ---------------------------------------------------------------------------

/**
 * The canonical set of HTTP method strings recognised by OpenAPI 3.x.
 * Used to constrain `Method` generics so autocomplete on typed
 * documents only suggests methods the path item actually declares,
 * not arbitrary string keys.
 */
type HttpMethod =
    | "get"
    | "put"
    | "post"
    | "delete"
    | "options"
    | "head"
    | "patch"
    | "trace";

/**
 * Extract the literal path keys from a document type, or the broad
 * `string` fallback when the document is untyped at compile time.
 *
 * For OpenAPI 3.1 documents the union includes keys from `webhooks`
 * alongside `paths`, because `<ApiOperation>` / `<ApiRequestBody>` /
 * `<ApiResponse>` resolve webhook names through the same code path as
 * paths (see `lookupPathItem` in `openapi/resolve.ts`). Without the
 * webhook keys, a typed `as const` 3.1 document that declares only
 * webhooks would reject every `path` prop value at compile time
 * ("Type 'string' is not assignable to type 'never'") despite working
 * at runtime.
 *
 * When the document declares neither a `paths` nor a `webhooks` map
 * the union falls back to `string` so untyped/foreign inputs keep
 * working — the constraint is informational, not gating.
 *
 * The `string extends keyof P` guard distinguishes a typed `as const`
 * document (whose `paths` map has literal keys) from a runtime
 * `Record<string, unknown>` document (whose `keyof` collapses to
 * `string`). For the runtime case we surface `string` so callers pass
 * arbitrary path values without losing the existing freedom.
 */
type PathKeysOf<D> =
    HasPathsOrWebhooks<D> extends true ? PathsKey<D> | WebhooksKey<D> : string;

/**
 * `true` when `D` declares either a `paths` or a `webhooks` object,
 * so the `PathKeysOf` union can be derived from real document keys
 * instead of falling back to `string`.
 */
type HasPathsOrWebhooks<D> = D extends { paths: Record<string, unknown> }
    ? true
    : D extends { webhooks: Record<string, unknown> }
      ? true
      : false;

/**
 * Literal `paths` keys, or `never` when the document does not declare
 * a `paths` object. Runtime documents (whose `keyof` collapses to
 * `string`) widen to `string` so callers retain prior freedom.
 */
type PathsKey<D> = D extends { paths: infer P }
    ? P extends Record<string, unknown>
        ? string extends keyof P
            ? string
            : Extract<keyof P, string>
        : never
    : never;

/**
 * Literal `webhooks` keys, or `never` when the document does not
 * declare a `webhooks` object (OpenAPI 3.1 only). Runtime documents
 * widen to `string`.
 */
type WebhooksKey<D> = D extends { webhooks: infer W }
    ? W extends Record<string, unknown>
        ? string extends keyof W
            ? string
            : Extract<keyof W, string>
        : never
    : never;

/**
 * Extract the methods declared on a specific path or webhook item,
 * restricted to the OpenAPI-recognised method set so non-method
 * extension keys (e.g. `summary`, `description`, `parameters`) do not
 * pollute the autocomplete.
 *
 * Runtime documents (typed `Record<string, unknown>`) widen back to
 * `string` so callers retain the freedom to pass arbitrary method
 * strings without surfacing an `HttpMethod` constraint at runtime
 * call sites. Untyped documents (`unknown`) also widen to `string` so
 * consumers with no static doc info can supply extension methods —
 * the canonical `HttpMethod` set is informational, not gating, when
 * the document carries no structural information at all.
 *
 * When the document declares `paths` or `webhooks` but not the
 * specific entry `P`, the union falls back to `HttpMethod` so callers
 * can still target an authored operation that compile-time inference
 * happens to miss (e.g. behind a deferred conditional type).
 */
type MethodKeysOf<D, P extends string> =
    IsRuntimeDoc<D> extends true
        ? string
        : unknown extends D
          ? string
          : HasPathsOrWebhooks<D> extends true
            ? MethodKeysWithFallback<D, P>
            : HttpMethod;

/**
 * Union of literal methods extracted from `paths[P]` and `webhooks[P]`,
 * falling back to the canonical `HttpMethod` set when neither map
 * declares the requested entry.
 */
type MethodKeysWithFallback<D, P extends string> = [
    MethodKeysFromPaths<D, P> | MethodKeysFromWebhooks<D, P>,
] extends [never]
    ? HttpMethod
    : MethodKeysFromPaths<D, P> | MethodKeysFromWebhooks<D, P>;

/**
 * Methods declared on `paths[P]`, restricted to `HttpMethod`.
 * Returns `never` when the document has no matching path entry.
 */
type MethodKeysFromPaths<D, P extends string> = D extends {
    paths: infer Paths;
}
    ? Paths extends Record<string, unknown>
        ? P extends keyof Paths
            ? Extract<keyof Paths[P], HttpMethod>
            : never
        : never
    : never;

/**
 * Methods declared on `webhooks[P]`, restricted to `HttpMethod`.
 * Returns `never` when the document has no matching webhook entry.
 */
type MethodKeysFromWebhooks<D, P extends string> = D extends {
    webhooks: infer Webhooks;
}
    ? Webhooks extends Record<string, unknown>
        ? P extends keyof Webhooks
            ? Extract<keyof Webhooks[P], HttpMethod>
            : never
        : never
    : never;

/**
 * True for the runtime-document sentinel — a `Record<string, unknown>`
 * (or wider) where `keyof` collapses to `string`. Used to drop
 * narrow-constraint defaults so runtime callers retain the prior
 * freedom to pass arbitrary path/method/status values.
 */
type IsRuntimeDoc<D> =
    D extends Record<string, unknown>
        ? string extends keyof D
            ? true
            : false
        : false;

/**
 * Generic "operation under a given map" extractor used by every
 * downstream `xxKeysOf` helper. Returns the Operation Object for the
 * given path-or-webhook name and method, or `never` when no such
 * entry exists.
 */
type OperationAt<Map_, P extends string, M extends string> =
    Map_ extends Record<string, unknown>
        ? P extends keyof Map_
            ? Map_[P] extends Record<string, unknown>
                ? M extends keyof Map_[P]
                    ? Map_[P][M]
                    : never
                : never
            : never
        : never;

/**
 * Locate the Operation Object for `path`/`method` across both `paths`
 * and `webhooks`. The OpenAPI 3.1 spec assigns webhooks the same
 * Path Item shape as `paths` entries, so structural inference is
 * identical once the operation is resolved.
 */
type ResolveOperation<D, P extends string, M extends string> =
    | (D extends { paths: infer Paths } ? OperationAt<Paths, P, M> : never)
    | (D extends { webhooks: infer Webhooks }
          ? OperationAt<Webhooks, P, M>
          : never);

/**
 * Extract the status-code keys declared by an operation's `responses`
 * map. Includes class wildcards (`2XX`, etc.) and the `default`
 * sentinel; runtime documents widen to `string`.
 */
type StatusKeysOf<D, P extends string, M extends string> =
    ResolveOperation<D, P, M> extends { responses: infer R }
        ? R extends Record<string, unknown>
            ? string extends keyof R
                ? string
                : Extract<keyof R, string>
            : string
        : string;

/**
 * Extract the content-type keys declared on a request body's
 * `content` map for the given path and method. Runtime documents
 * widen to `string`.
 */
type RequestContentTypesOf<D, P extends string, M extends string> =
    ResolveOperation<D, P, M> extends {
        requestBody: { content: infer C };
    }
        ? C extends Record<string, unknown>
            ? string extends keyof C
                ? string
                : Extract<keyof C, string>
            : string
        : string;

/**
 * Extract the content-type keys declared on a response entry's
 * `content` map for the given path, method, and status. Runtime
 * documents widen to `string`.
 */
type ResponseContentTypesOf<
    D,
    P extends string,
    M extends string,
    S extends string,
> =
    ResolveOperation<D, P, M> extends { responses: infer R }
        ? R extends Record<string, unknown>
            ? S extends keyof R
                ? R[S] extends { content: infer C }
                    ? C extends Record<string, unknown>
                        ? string extends keyof C
                            ? string
                            : Extract<keyof C, string>
                        : string
                    : string
                : string
            : string
        : string;

// ---------------------------------------------------------------------------
// Shared diagnostics props
// ---------------------------------------------------------------------------

/**
 * Diagnostics props accepted by every top-level OpenAPI component.
 *
 * `onDiagnostic` is the sink invoked for each event surfaced by the
 * normalisation pipeline (duplicate body parameter, dropped Swagger
 * feature, divisible-by conflict, unknown JSON Schema dialect,
 * relative-ref resolved, etc.). `strict` converts every emitted
 * diagnostic into a thrown `SchemaNormalisationError`.
 */
interface ApiDiagnosticsProps {
    onDiagnostic?: DiagnosticSink;
    strict?: boolean;
}

function buildDiagnostics(
    onDiagnostic: DiagnosticSink | undefined,
    strict: boolean | undefined
): DiagnosticsOptions | undefined {
    if (onDiagnostic === undefined && strict !== true) return undefined;
    const opts: DiagnosticsOptions = {};
    if (onDiagnostic !== undefined) opts.diagnostics = onDiagnostic;
    if (strict === true) opts.strict = true;
    return opts;
}

/**
 * Coerce an `unknown` `schema` prop to a document record. Returns
 * `undefined` when the prop is not a plain object, surfacing a
 * `doc-not-object` diagnostic so silent "empty document" misbehaviour
 * (the historic `toDoc` `{}` fallback) is impossible.
 *
 * Components MUST short-circuit when this returns `undefined` rather
 * than rendering empty operation lists.
 */
function resolveRootDoc(
    doc: unknown,
    diagnostics: DiagnosticsOptions | undefined
): Record<string, unknown> | undefined {
    const resolved = toDoc(doc);
    if (resolved === undefined) {
        emitDiagnostic(diagnostics, {
            code: "doc-not-object",
            message:
                "OpenAPI document prop is not a plain object; nothing to render",
            pointer: "",
            detail: { received: typeof doc },
        });
    }
    return resolved;
}

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

    const rootMeta = extractRootMetaFromJson(schema);

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
// externalDocs / xml surface
// ---------------------------------------------------------------------------

/**
 * Render a Schema Object or Operation Object's `externalDocs` as a
 * simple anchor with optional descriptive text. Returns `null` when no
 * externalDocs are attached so callers can drop it into JSX without an
 * extra guard.
 */
function ExternalDocsLink({
    externalDocs,
}: {
    externalDocs: ExternalDocs | undefined;
}): ReactNode {
    if (externalDocs === undefined) return null;
    // OpenAPI documents are frequently authored by third parties; an
    // attacker-controlled externalDocs.url with a `javascript:` or `data:`
    // scheme would otherwise reach the DOM as a live anchor. Fall back to
    // a plain `<span>` when the URL fails the safe-scheme check so the
    // link is rendered as inert text rather than an XSS sink.
    const label = externalDocs.description ?? externalDocs.url;
    if (!isSafeHyperlink(externalDocs.url)) {
        return (
            <p data-external-docs>
                <span>{label}</span>
            </p>
        );
    }
    return (
        <p data-external-docs>
            <a href={externalDocs.url}>{label}</a>
        </p>
    );
}

/**
 * Render a Schema Object's `xml` metadata as a footnote. The library
 * does not render XML payloads natively, but the metadata still
 * carries author intent (namespaces, element names, wrapping rules).
 * Surface it so consumers can audit the dropped feature without
 * losing the underlying information.
 */
function SchemaXmlFootnote({ xml }: { xml: XmlInfo | undefined }): ReactNode {
    if (xml === undefined) return null;
    return (
        <aside data-schema-xml>
            <small>
                XML representation
                {xml.name !== undefined && ` — name: ${xml.name}`}
                {xml.namespace !== undefined &&
                    ` — namespace: ${xml.namespace}`}
                {xml.prefix !== undefined && ` — prefix: ${xml.prefix}`}
                {xml.attribute && " — attribute"}
                {xml.wrapped && " — wrapped"}
            </small>
        </aside>
    );
}

// ---------------------------------------------------------------------------
// <ApiOperation>
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ApiOperation}.
 *
 * @group OpenAPI
 */
export interface ApiOperationProps<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
    ContentType extends RequestContentTypesOf<Doc, Path, Method> =
        RequestContentTypesOf<Doc, Path, Method>,
    ResponseStatus extends StatusKeysOf<Doc, Path, Method> = StatusKeysOf<
        Doc,
        Path,
        Method
    >,
    ResponseContentType extends ResponseContentTypesOf<
        Doc,
        Path,
        Method,
        ResponseStatus
    > = ResponseContentTypesOf<Doc, Path, Method, ResponseStatus>,
> extends ApiDiagnosticsProps {
    schema: Doc;
    path: Path;
    method: Method;
    /**
     * Current request body value. Inferred from the operation's
     * request body schema via {@link OpenAPIRequestBodyType} so a
     * typed `schema` argument drives the rendered value's shape.
     */
    requestBodyValue?: OpenAPIRequestBodyType<
        Doc,
        Path & string,
        Method & string,
        ContentType & string
    >;
    /**
     * Called when the request body value changes. Parameter type
     * mirrors {@link ApiOperationProps.requestBodyValue}.
     */
    onRequestBodyChange?: (
        value: OpenAPIRequestBodyType<
            Doc,
            Path & string,
            Method & string,
            ContentType & string
        >
    ) => void;
    /**
     * Current response value. Inferred via {@link OpenAPIResponseType}
     * from the operation's response schema for the supplied
     * `responseStatus` (defaulting to the union of declared statuses)
     * and `responseContentType` (defaulting to the union of declared
     * media types). The same value is rendered against every response
     * card the component emits.
     */
    responseValue?: OpenAPIResponseType<
        Doc,
        Path & string,
        Method & string,
        ResponseStatus & string,
        ResponseContentType & string
    >;
    meta?: SchemaMeta;
    /**
     * Media type whose request body schema drives `requestBodyFields`
     * inference. Defaults to the union of declared content types so
     * callers can omit it; supply explicitly to narrow inference to a
     * specific media type. Mirrors {@link ApiRequestBodyProps.contentType}
     * so `<ApiOperation>` can target non-JSON request bodies with the
     * same precision as `<ApiRequestBody>`.
     */
    requestBodyContentType?: ContentType;
    /**
     * Status code whose response schema drives `responseValue`
     * inference. Defaults to the union of declared statuses so
     * callers can omit it; supply explicitly to narrow inference to
     * a specific response (e.g. `"200"`).
     */
    responseStatus?: ResponseStatus;
    /**
     * Media type whose response schema drives `responseValue`
     * inference. Defaults to the union of declared content types so
     * callers can omit it; supply explicitly to narrow inference to
     * a specific media type.
     */
    responseContentType?: ResponseContentType;
    requestBodyFields?: Doc extends Record<string, unknown>
        ? InferRequestBodyFields<
              Doc,
              Path & string,
              Method & string,
              ContentType & string
          >
        : Record<string, FieldOverride>;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

/**
 * Render a single OpenAPI operation — header, parameters, request body,
 * responses, callbacks, security, and external docs — picked out of a
 * supplied document by `path` and `method`.
 *
 * When `schema` is typed `as const`, `requestBodyFields` autocomplete
 * resolves from the operation's request body schema. The component
 * works with OpenAPI 2.0, 3.0, and 3.1 inputs (Swagger 2.0 documents
 * are normalised to 3.1 internally) and also resolves OpenAPI 3.1
 * webhooks under the same code path.
 *
 * @group OpenAPI
 * @example
 * ```tsx
 * import { ApiOperation } from "schema-components/openapi/components";
 *
 * <ApiOperation schema={petStore} path="/pets" method="post" />
 * ```
 */
export function ApiOperation<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
    ContentType extends RequestContentTypesOf<Doc, Path, Method> =
        RequestContentTypesOf<Doc, Path, Method>,
    ResponseStatus extends StatusKeysOf<Doc, Path, Method> = StatusKeysOf<
        Doc,
        Path,
        Method
    >,
    ResponseContentType extends ResponseContentTypesOf<
        Doc,
        Path,
        Method,
        ResponseStatus
    > = ResponseContentTypesOf<Doc, Path, Method, ResponseStatus>,
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
    onDiagnostic,
    strict,
}: ApiOperationProps<
    Doc,
    Path,
    Method,
    ContentType,
    ResponseStatus,
    ResponseContentType
>): ReactNode {
    const diagnostics = buildDiagnostics(onDiagnostic, strict);
    const instancePrefix = sanitisePrefix(useId());
    const rootDoc = resolveRootDoc(doc, diagnostics);
    if (rootDoc === undefined) return null;
    // Run the normalisation pipeline once and reuse the parsed result.
    // Diagnostics emit during normalisation, so a second `getParsed` with
    // the same sink would double-fire every event.
    const parsed = getParsed(rootDoc, diagnostics);
    const resolved = resolveOperation(parsed, path, method, diagnostics);
    const securityReqs = extractSecurityRequirements(parsed, path, method);
    const securitySchemes = extractSecuritySchemes(parsed);
    const callbacks = listCallbacks(parsed, path, method);

    const operationExternalDocs = extractExternalDocs(
        resolved.operation.operation
    );
    const requestBodyXml =
        resolved.requestBody?.schema !== undefined
            ? extractXmlInfo(resolved.requestBody.schema)
            : undefined;

    return (
        <section data-operation={`${method.toUpperCase()} ${path}`}>
            <OperationHeader
                operation={resolved.operation}
                pathItem={resolved.pathItem}
            />
            <ExternalDocsLink externalDocs={operationExternalDocs} />
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
                        diagnostics={diagnostics}
                        pointerPrefix={operationPointer(path, method)}
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
                        // Runtime boundary: `onRequestBodyChange` is
                        // typed against the inferred request body shape,
                        // but `renderSchema` accepts `(value: unknown)`
                        // because the walker emits `unknown` values. The
                        // shape matches the schema we just walked so
                        // the runtime call is sound; TypeScript cannot
                        // prove the generic-parameter assignment in a
                        // contravariant position. Same pattern as
                        // `<SchemaComponent>`'s `onChange` dispatcher.
                        // @ts-expect-error — contravariant onChange call.
                        onChange: onRequestBodyChange,
                        fields: requestBodyFields,
                        meta,
                        widgets,
                        rootPath: joinPath(instancePrefix, "requestBody"),
                    })}
                    <SchemaXmlFootnote xml={requestBodyXml} />
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
                            parsed={parsed}
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

/**
 * Props accepted by {@link ApiParameters}.
 *
 * @group OpenAPI
 */
export interface ApiParametersProps<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
> extends ApiDiagnosticsProps {
    schema: Doc;
    path: Path;
    method: Method;
    meta?: SchemaMeta;
    overrides?: Doc extends Record<string, unknown>
        ? InferParameterOverrides<Doc, Path & string, Method & string>
        : Record<string, FieldOverride>;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

/**
 * Render the `parameters` of a single OpenAPI operation — path, query,
 * header, and cookie parameters — picked out of `schema` by `path` and
 * `method`. When the document is typed `as const`, the `overrides` prop
 * autocompletes on each parameter name.
 *
 * @group OpenAPI
 */
export function ApiParameters<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
>({
    schema: doc,
    path,
    method,
    meta,
    overrides,
    widgets,
    onDiagnostic,
    strict,
}: ApiParametersProps<Doc, Path, Method>): ReactNode {
    const diagnostics = buildDiagnostics(onDiagnostic, strict);
    const instancePrefix = sanitisePrefix(useId());
    const rootDoc = resolveRootDoc(doc, diagnostics);
    if (rootDoc === undefined) return null;
    const parsed = getParsed(rootDoc, diagnostics);
    const params = resolveParameters(parsed, path, method);

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
                diagnostics={diagnostics}
                pointerPrefix={operationPointer(path, method)}
            />
        </section>
    );
}

// ---------------------------------------------------------------------------
// <ApiRequestBody>
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ApiRequestBody}.
 *
 * @group OpenAPI
 */
export interface ApiRequestBodyProps<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
    ContentType extends RequestContentTypesOf<Doc, Path, Method> =
        RequestContentTypesOf<Doc, Path, Method>,
> extends ApiDiagnosticsProps {
    schema: Doc;
    path: Path;
    method: Method;
    /**
     * Media type whose schema should be rendered for the request body.
     * Defaults to the union of declared content types so callers can
     * omit it; supply explicitly to narrow `fields` inference to a
     * specific media type via {@link InferRequestBodyFields}.
     */
    contentType?: ContentType;
    value?: unknown;
    onChange?: (value: unknown) => void;
    meta?: SchemaMeta;
    fields?: Doc extends Record<string, unknown>
        ? InferRequestBodyFields<
              Doc,
              Path & string,
              Method & string,
              ContentType & string
          >
        : Record<string, FieldOverride>;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

/**
 * Render the request body of a single OpenAPI operation, picked out of
 * `schema` by `path` and `method`. Returns `null` when the operation
 * declares no request body or no resolvable schema.
 *
 * When `schema` is typed `as const`, `fields` autocomplete resolves
 * from the request body schema; pass `contentType` to narrow inference
 * to a specific media type.
 *
 * @group OpenAPI
 */
export function ApiRequestBody<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
    ContentType extends RequestContentTypesOf<Doc, Path, Method> =
        RequestContentTypesOf<Doc, Path, Method>,
>({
    schema: doc,
    path,
    method,
    value,
    onChange,
    meta,
    fields,
    widgets,
    onDiagnostic,
    strict,
}: ApiRequestBodyProps<Doc, Path, Method, ContentType>): ReactNode {
    const diagnostics = buildDiagnostics(onDiagnostic, strict);
    const instancePrefix = sanitisePrefix(useId());
    const rootDoc = resolveRootDoc(doc, diagnostics);
    if (rootDoc === undefined) return null;
    const parsed = getParsed(rootDoc, diagnostics);
    const requestBody = resolveRequestBody(parsed, path, method);

    if (requestBody?.schema === undefined) {
        return null;
    }

    const requestBodyXml = extractXmlInfo(requestBody.schema);

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
            <SchemaXmlFootnote xml={requestBodyXml} />
        </section>
    );
}

// ---------------------------------------------------------------------------
// <ApiResponse>
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ApiResponse}.
 *
 * @group OpenAPI
 */
export interface ApiResponseProps<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
    Status extends StatusKeysOf<Doc, Path, Method> = StatusKeysOf<
        Doc,
        Path,
        Method
    >,
    ContentType extends ResponseContentTypesOf<Doc, Path, Method, Status> =
        ResponseContentTypesOf<Doc, Path, Method, Status>,
> extends ApiDiagnosticsProps {
    schema: Doc;
    path: Path;
    method: Method;
    status: Status;
    /**
     * Media type whose schema should be rendered. Defaults to the
     * union of declared content types so callers can omit it;
     * supply explicitly to narrow `fields` inference via
     * {@link InferResponseFields}.
     */
    contentType?: ContentType;
    value?: unknown;
    meta?: SchemaMeta;
    fields?: Doc extends Record<string, unknown>
        ? InferResponseFields<
              Doc,
              Path & string,
              Method & string,
              Status & string,
              ContentType & string
          >
        : Record<string, FieldOverride>;
    /** Instance-scoped widgets. */
    widgets?: WidgetMap;
}

/**
 * Render the response schema for a single OpenAPI operation status —
 * picked out of `schema` by `path`, `method`, and `status`.
 *
 * Status resolution follows the OpenAPI priority order: concrete code
 * (e.g. `"200"`) \> class wildcard (e.g. `"2XX"`) \> `"default"`. When
 * `schema` is typed `as const`, `fields` autocomplete resolves from
 * the response schema; pass `contentType` to narrow inference to a
 * specific media type.
 *
 * @group OpenAPI
 */
export function ApiResponse<
    Doc = unknown,
    Path extends PathKeysOf<Doc> = PathKeysOf<Doc>,
    Method extends MethodKeysOf<Doc, Path> = MethodKeysOf<Doc, Path>,
    Status extends StatusKeysOf<Doc, Path, Method> = StatusKeysOf<
        Doc,
        Path,
        Method
    >,
    ContentType extends ResponseContentTypesOf<Doc, Path, Method, Status> =
        ResponseContentTypesOf<Doc, Path, Method, Status>,
>({
    schema: doc,
    path,
    method,
    status,
    value,
    meta,
    fields,
    widgets,
    onDiagnostic,
    strict,
}: ApiResponseProps<Doc, Path, Method, Status, ContentType>): ReactNode {
    const diagnostics = buildDiagnostics(onDiagnostic, strict);
    const instancePrefix = sanitisePrefix(useId());
    const rootDoc = resolveRootDoc(doc, diagnostics);
    if (rootDoc === undefined) return null;
    const parsed = getParsed(rootDoc, diagnostics);
    const response = resolveResponse(parsed, path, method, status);

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
            parsed={parsed}
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
// <ApiWebhook>
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ApiWebhook}.
 *
 * @group OpenAPI
 */
export interface ApiWebhookProps extends ApiDiagnosticsProps {
    schema: unknown;
    /** Webhook name (key under the document's `webhooks` map). */
    name: string;
    /** Instance-scoped widgets, forwarded to each rendered operation. */
    widgets?: WidgetMap;
    meta?: SchemaMeta;
}

/**
 * Render a single OpenAPI 3.1 webhook by name. A webhook is a Path Item
 * Object under the document's top-level `webhooks` map; once resolved,
 * its operations are structurally identical to operations under `paths`.
 *
 * Delegates to {@link ApiOperation} for each method present on the
 * webhook's Path Item Object — the parser's `lookupPathItem` resolves
 * webhook names through the same code path as paths, so `ApiOperation`
 * works for both with no special-casing in the renderer.
 *
 * @group OpenAPI
 */
export function ApiWebhook({
    schema: doc,
    name,
    widgets,
    meta,
    onDiagnostic,
    strict,
}: ApiWebhookProps): ReactNode {
    const diagnostics = buildDiagnostics(onDiagnostic, strict);
    const instancePrefix = sanitisePrefix(useId());
    const rootDoc = resolveRootDoc(doc, diagnostics);
    if (rootDoc === undefined) return null;
    const parsed = getParsed(rootDoc, diagnostics);
    const webhooks = listWebhooks(parsed);
    const webhook = webhooks.find((w) => w.name === name);
    if (webhook === undefined) return null;

    return (
        <section data-webhook={name} data-instance={instancePrefix}>
            <h3>Webhook: {name}</h3>
            {webhook.operations.map((op) => {
                const opProps: ApiOperationProps<Record<string, unknown>> = {
                    schema: rootDoc,
                    path: name,
                    method: op.method,
                };
                if (widgets !== undefined) opProps.widgets = widgets;
                if (meta !== undefined) opProps.meta = meta;
                return (
                    <ApiOperation key={`${name}-${op.method}`} {...opProps} />
                );
            })}
        </section>
    );
}

// ---------------------------------------------------------------------------
// <ApiWebhooks>
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ApiWebhooks}.
 *
 * @group OpenAPI
 */
export interface ApiWebhooksProps extends ApiDiagnosticsProps {
    schema: unknown;
    widgets?: WidgetMap;
    meta?: SchemaMeta;
}

/**
 * Render every OpenAPI 3.1 webhook declared on the document, one
 * `<ApiWebhook>` per entry. Returns `null` when the document has no
 * `webhooks` map or the map is empty.
 *
 * @group OpenAPI
 */
export function ApiWebhooks({
    schema: doc,
    widgets,
    meta,
    onDiagnostic,
    strict,
}: ApiWebhooksProps): ReactNode {
    const diagnostics = buildDiagnostics(onDiagnostic, strict);
    const instancePrefix = sanitisePrefix(useId());
    const rootDoc = resolveRootDoc(doc, diagnostics);
    if (rootDoc === undefined) return null;
    const parsed = getParsed(rootDoc, diagnostics);
    const webhooks = listWebhooks(parsed);
    if (webhooks.length === 0) return null;

    return (
        <section data-webhooks data-instance={instancePrefix}>
            <h2>Webhooks</h2>
            {webhooks.map((webhook) => {
                const props: ApiWebhookProps = {
                    schema: rootDoc,
                    name: webhook.name,
                };
                if (widgets !== undefined) props.widgets = widgets;
                if (meta !== undefined) props.meta = meta;
                return <ApiWebhook key={webhook.name} {...props} />;
            })}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function OperationHeader({
    operation,
    pathItem,
}: {
    operation: OperationInfo;
    pathItem: PathItemInfo;
}): ReactNode {
    // OpenAPI 3.1 added optional `summary` and `description` to Path Item
    // Objects (in addition to the existing operation-level fields). When
    // present, render them as a preamble above the operation header so the
    // path-wide narrative is visible without obscuring the operation's own
    // metadata. Both are plain text per the spec — no Markdown rendering.
    return (
        <header>
            {(pathItem.summary !== undefined ||
                pathItem.description !== undefined) && (
                <div data-path-info>
                    {pathItem.summary !== undefined && (
                        <p data-path-summary>{pathItem.summary}</p>
                    )}
                    {pathItem.description !== undefined && (
                        <p data-path-description>{pathItem.description}</p>
                    )}
                </div>
            )}
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
    diagnostics,
    pointerPrefix,
}: {
    parameters: ParameterInfo[];
    rootDoc: Record<string, unknown>;
    overrides?: unknown;
    meta?: SchemaMeta | undefined;
    widgets?: WidgetMap | undefined;
    idPrefix: string;
    /**
     * Diagnostics sink used to surface parameters that violate the
     * OpenAPI 3.x requirement that every Parameter Object declare
     * `schema` (or `content`). The runtime resolver already discards the
     * `content`-only path; here we report and skip schema-less ones
     * rather than fabricating a sentinel `{ type: "string" }` shape.
     */
    diagnostics?: DiagnosticsOptions | undefined;
    /**
     * JSON Pointer prefix identifying which Operation Object the
     * parameter list belongs to (e.g. `/paths/~1pets/get`). Diagnostics
     * append `/parameters/<name>` so consumers can locate the offending
     * declaration in the source document.
     */
    pointerPrefix: string;
}): ReactNode {
    return (
        <>
            {parameters.map((param) => {
                if (param.schema === undefined) {
                    emitDiagnostic(diagnostics, {
                        code: "parameter-missing-schema",
                        message: `Parameter "${param.name}" has no schema; rendering skipped`,
                        pointer: `${pointerPrefix}/parameters/${param.name}`,
                        detail: {
                            name: param.name,
                            location: param.location,
                        },
                    });
                    return null;
                }
                return (
                    <div key={param.name} data-parameter={param.name}>
                        <label>
                            {param.name}
                            {param.required && <span data-required>*</span>}
                        </label>
                        {param.description && (
                            <span data-description>{param.description}</span>
                        )}
                        {renderSchema(param.schema, rootDoc, {
                            meta: buildParamMeta(param, overrides, meta),
                            widgets,
                            rootPath: joinPath(idPrefix, param.name),
                        })}
                    </div>
                );
            })}
        </>
    );
}

function ResponseCard({
    response,
    rootDoc,
    parsed,
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
    /**
     * Already-parsed document, supplied by the enclosing component so
     * link lookup reuses the same normalisation pass that produced
     * `response`. Calling `getParsed` again would re-run normalisation
     * and re-emit every diagnostic into the configured sink.
     */
    parsed: OpenApiDocument;
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
    // `extractLinks` returns `[]` for the no-links case, so any exception
    // bubbling out is a genuine bug (e.g. malformed parser state) — let it
    // propagate rather than silencing it with an empty array.
    let links: LinkInfo[] = [];
    if (path !== undefined && method !== undefined) {
        links = extractLinks(parsed, path, method, response.statusCode);
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

/**
 * Compose the JSON Pointer prefix for an operation's Parameter Object
 * map. Paths conventionally begin with `/` so they live under
 * `#/paths/<escaped path>/<method>`; OpenAPI 3.1 webhook names (which
 * have no leading slash) live under `#/webhooks/<name>/<method>`.
 *
 * JSON Pointer (RFC 6901) requires `~` → `~0` and `/` → `~1`. The
 * escape order matters: `~` first to avoid double-escaping the `~1`
 * produced for `/`.
 */
function operationPointer(path: string, method: string): string {
    const segment = path.startsWith("/") ? "paths" : "webhooks";
    const escapedPath = path.replace(/~/g, "~0").replace(/\//g, "~1");
    return `/${segment}/${escapedPath}/${method}`;
}

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
