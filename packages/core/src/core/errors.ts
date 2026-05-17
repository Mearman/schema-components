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

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

/**
 * Base class for all schema-components errors.
 * Catch this to handle any library error uniformly.
 */
export class SchemaError extends Error {
    /** The schema input that caused the error. */
    readonly schema: unknown;

    constructor(message: string, schema: unknown) {
        super(message);
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
 * JSON Schema, missing OpenAPI ref, unsupported ref format.
 */
export class SchemaNormalisationError extends SchemaError {
    readonly kind:
        | "invalid-zod"
        | "zod3-unsupported"
        | "zod-transform-unsupported"
        | "zod-type-unrepresentable"
        | "zod-conversion-failed"
        | "invalid-json-schema"
        | "openapi-missing-ref"
        | "openapi-invalid"
        | "unknown";

    /**
     * For `zod-type-unrepresentable`, the offending Zod type name
     * (e.g. "bigint", "date", "map", "set"). `undefined` for other kinds.
     */
    readonly zodType: string | undefined;

    /**
     * The original underlying error, when this normalisation error wraps
     * another exception (typically the error thrown by `z.toJSONSchema()`).
     * Preserves the source stack trace so the root cause is not lost when
     * the classifier translates the message.
     */
    readonly cause: unknown;

    constructor(
        message: string,
        schema: unknown,
        kind: SchemaNormalisationError["kind"],
        zodType?: string,
        cause?: unknown
    ) {
        super(message, schema);
        this.name = "SchemaNormalisationError";
        this.kind = kind;
        this.zodType = zodType;
        this.cause = cause;
    }
}

// ---------------------------------------------------------------------------
// Render errors
// ---------------------------------------------------------------------------

/**
 * A theme adapter's render function threw during rendering.
 *
 * The `cause` is the original error from the render function.
 */
export class SchemaRenderError extends SchemaError {
    /** The schema type being rendered when the error occurred. */
    readonly schemaType: string;
    /** The original error from the render function. */
    readonly cause: unknown;

    constructor(
        message: string,
        schema: unknown,
        schemaType: string,
        cause: unknown
    ) {
        super(message, schema);
        this.name = "SchemaRenderError";
        this.schemaType = schemaType;
        this.cause = cause;
    }
}

// ---------------------------------------------------------------------------
// Field resolution errors
// ---------------------------------------------------------------------------

/**
 * A field path couldn't be resolved against the walked schema tree.
 *
 * This is produced by `<SchemaField>` when the `path` prop doesn't
 * match any field in the schema.
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
