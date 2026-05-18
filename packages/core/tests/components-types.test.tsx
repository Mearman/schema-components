/**
 * — compile-time type tests for `openapi/components.tsx`.
 *
 * Pure compile-time checks. If this file typechecks, the tests pass.
 * Run: `pnpm --filter schema-components _typecheck`.
 *
 * Covers:
 *  1. OpenAPI 3.1 documents declaring `webhooks` (with or without
 *     `paths`) are accepted by `<ApiOperation>` / `<ApiRequestBody>` /
 *     `<ApiResponse>` — `path` / `method` props for a webhook entry
 *     typecheck rather than being rejected with
 *     `Type 'string' is not assignable to type 'never'`.
 *  2. `MethodKeysOf<unknown>` widens to `string` so consumers with no
 *     static doc info can supply extension methods (and not be
 *     restricted to the canonical 8 HTTP methods).
 */

import type {
    ApiOperationProps,
    ApiRequestBodyProps,
    ApiResponseProps,
} from "../src/openapi/components.tsx";

// ---------------------------------------------------------------------------
// 1. OpenAPI 3.1 webhook documents typecheck across the three components
// ---------------------------------------------------------------------------

const webhookOnlyDoc = {
    openapi: "3.1.0",
    info: { title: "Webhook only", version: "1.0.0" },
    webhooks: {
        orderCreated: {
            post: {
                requestBody: {
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "ok",
                    },
                },
            },
        },
    },
} as const;

type WebhookRequestBody = ApiRequestBodyProps<
    typeof webhookOnlyDoc,
    "orderCreated",
    "post"
>;
const webhookRequestBodyProps: WebhookRequestBody = {
    schema: webhookOnlyDoc,
    path: "orderCreated",
    method: "post",
};
void webhookRequestBodyProps;

type WebhookOperation = ApiOperationProps<
    typeof webhookOnlyDoc,
    "orderCreated",
    "post"
>;
const webhookOperationProps: WebhookOperation = {
    schema: webhookOnlyDoc,
    path: "orderCreated",
    method: "post",
};
void webhookOperationProps;

type WebhookResponse = ApiResponseProps<
    typeof webhookOnlyDoc,
    "orderCreated",
    "post",
    "200"
>;
const webhookResponseProps: WebhookResponse = {
    schema: webhookOnlyDoc,
    path: "orderCreated",
    method: "post",
    status: "200",
};
void webhookResponseProps;

// Mixed paths + webhooks document still typechecks for path entries.
const mixedDoc = {
    openapi: "3.1.0",
    info: { title: "Mixed", version: "1.0.0" },
    paths: {
        "/pets": {
            get: {
                responses: { "200": { description: "ok" } },
            },
        },
    },
    webhooks: {
        petCreated: {
            post: {
                responses: { "200": { description: "ok" } },
            },
        },
    },
} as const;

type MixedPathOp = ApiOperationProps<typeof mixedDoc, "/pets", "get">;
const mixedPathOpProps: MixedPathOp = {
    schema: mixedDoc,
    path: "/pets",
    method: "get",
};
void mixedPathOpProps;

type MixedWebhookOp = ApiOperationProps<typeof mixedDoc, "petCreated", "post">;
const mixedWebhookOpProps: MixedWebhookOp = {
    schema: mixedDoc,
    path: "petCreated",
    method: "post",
};
void mixedWebhookOpProps;

// ---------------------------------------------------------------------------
// 2. MethodKeysOf<unknown> accepts extension method strings
// ---------------------------------------------------------------------------

// When the document is fully untyped (`unknown`), the method prop must
// widen to `string` so consumers can pass arbitrary extension methods
// (e.g. `"query"` from the GraphQL-over-HTTP gateway draft) without the
// canonical 8 HTTP methods being a forced ceiling.
type UnknownDocOp = ApiOperationProps<unknown, string, string>;
const unknownDocCustomMethodProps: UnknownDocOp = {
    schema: {},
    path: "/whatever",
    method: "query",
};
void unknownDocCustomMethodProps;
