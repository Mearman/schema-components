/**
 * Structured error types for schema-components.
 *
 * Every error produced by the library is one of these three types:
 *
 * - SchemaNormalisationError — the adapter failed to convert the input
 *   to JSON Schema (invalid Zod, bad OpenAPI ref, malformed schema)
 * - SchemaRenderError — a theme adapter's render function threw
 * - SchemaFieldError — a field path couldn't be resolved
 *
 * All extend `SchemaError` so consumers can catch the base class.
 */

import type { SchemaType } from "./types.ts";

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

/**
 * Base class for every schema-components error. Catch this to handle
 * any library error uniformly.
 *
 * Forwards the optional `cause` to the native ES2022 `Error` constructor
 * so `error.cause` is wired up by the runtime and rendered correctly by
 * `util.inspect` ("Caused by: ..."). Subclasses that need a typed
 * `cause` field still get it via the platform's own `Error.cause`
 * getter.
 *
 * @group Errors
 */
export class SchemaError extends Error {
    /** The schema input that caused the error. */
    readonly schema: unknown;

    constructor(message: string, schema: unknown, cause?: unknown) {
        super(message, cause !== undefined ? { cause } : undefined);
        this.name = "SchemaError";
        this.schema = schema;
    }
}

// ---------------------------------------------------------------------------
// Normalisation errors
// ---------------------------------------------------------------------------

/**
 * The adapter failed to convert the input schema to JSON Schema.
 *
 * Causes: invalid Zod schema, Zod 3 schema (unsupported), malformed
 * JSON Schema, missing OpenAPI ref, unsupported ref format,
 * unrepresentable Zod types, conversion bugs, cycles, and duplicate
 * ids. The `kind` field carries the precise classification — see the
 * union declaration below.
 *
 * @group Errors
 */
export class SchemaNormalisationError extends SchemaError {
    readonly kind:
        | "invalid-zod"
        | "unsupported-schema"
        | "zod3-unsupported"
        | "zod-transform-unsupported"
        | "zod-type-unrepresentable"
        | "zod-conversion-failed"
        | "zod-conversion-bug"
        | "zod-cycle-detected"
        | "zod-duplicate-id"
        | "invalid-json-schema"
        | "openapi-missing-ref"
        | "openapi-invalid"
        | "unknown";

    /**
     * For `zod-type-unrepresentable`, the offending Zod type name
     * (e.g. "bigint", "date", "map", "set"). `undefined` for other kinds.
     */
    readonly zodType: string | undefined;

    constructor(
        message: string,
        schema: unknown,
        kind: SchemaNormalisationError["kind"],
        zodType?: string,
        cause?: unknown
    ) {
        // Forward `cause` to the native Error constructor so
        // `error.cause` is wired by the runtime (ES2022) and rendered by
        // `util.inspect` as a "Caused by" chain. No own field needed —
        // the platform-provided getter on the Error instance is the source
        // of truth.
        super(message, schema, cause);
        this.name = "SchemaNormalisationError";
        this.kind = kind;
        this.zodType = zodType;
    }
}

// ---------------------------------------------------------------------------
// Render errors
// ---------------------------------------------------------------------------

/**
 * A theme adapter's render function threw during rendering. The
 * original error is preserved on `cause`.
 *
 * @group Errors
 */
export class SchemaRenderError extends SchemaError {
    /**
     * The schema type being rendered when the error occurred. Drawn from
     * the walker's discriminant union so consumers can switch on it
     * exhaustively without a wider `string` fallback.
     */
    readonly schemaType: SchemaType;

    constructor(
        message: string,
        schema: unknown,
        schemaType: SchemaType,
        cause: unknown
    ) {
        // `cause` is forwarded to the native Error constructor so
        // `error.cause` is wired by the runtime and rendered by
        // `util.inspect`. The base class threads it through.
        super(message, schema, cause);
        this.name = "SchemaRenderError";
        this.schemaType = schemaType;
    }
}

// ---------------------------------------------------------------------------
// Field resolution errors
// ---------------------------------------------------------------------------

/**
 * A field path could not be resolved against the walked schema tree.
 * Produced by `<SchemaField>` when the `path` prop does not match any
 * field in the schema.
 *
 * @group Errors
 */
export class SchemaFieldError extends SchemaError {
    /** The unresolvable dot-separated path. */
    readonly path: string;

    constructor(message: string, schema: unknown, path: string) {
        super(message, schema);
        this.name = "SchemaFieldError";
        this.path = path;
    }
}
