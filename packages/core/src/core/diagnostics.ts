/**
 * Diagnostics channel for schema-components.
 *
 * Provides a structured way to surface silent fallbacks — unresolved `$ref`,
 * unknown keywords, unknown `format` values, invalid `const` values,
 * unsupported `type` entries, dropped Swagger 2.0 features, external
 * `$ref`, type-negation fallbacks, and conditional fallbacks.
 *
 * Consumers pass a `DiagnosticSink` callback to receive diagnostics
 * as they occur. By default, diagnostics are silently discarded.
 * Setting `strict: true` converts any diagnostic into a thrown
 * `SchemaCompatibilityError`.
 */

import { SchemaNormalisationError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Diagnostic codes
// ---------------------------------------------------------------------------

/**
 * Machine-readable codes identifying each class of diagnostic.
 * Stable across releases — consumers can pattern-match on these.
 *
 * @group Diagnostics
 */
export type DiagnosticCode =
    | "allof-conflict"
    | "assumed-draft"
    | "bare-exclusive-bound"
    | "conditional-fallback"
    | "cross-schema-relative-ref-unsupported"
    | "cyclic-header-ref"
    | "cyclic-link-ref"
    | "cyclic-parameter-ref"
    | "cyclic-path-item-ref"
    | "dependencies-conflict"
    | "dependent-required-invalid"
    | "depth-exceeded"
    | "discriminator-duplicate"
    | "discriminator-inconsistent"
    | "divisible-by-conflict"
    | "doc-not-object"
    | "dropped-swagger-feature"
    | "header-ref-too-deep"
    | "duplicate-body-parameter"
    | "duplicate-operation-id"
    | "dynamic-ref-degraded"
    | "enum-empty"
    | "enum-value-filtered"
    | "external-ref"
    | "invalid-const"
    | "invalid-id-fragment"
    | "keyword-out-of-draft"
    | "link-ref-too-deep"
    | "legacy-dependencies-split"
    | "legacy-dependencies-split-2019"
    | "non-json-media-type-fallback"
    | "parameter-missing-schema"
    | "parameter-ref-too-deep"
    | "path-item-ref-too-deep"
    | "path-webhook-name-collision"
    | "pattern-invalid"
    | "prototype-polluting-property"
    | "recursive-anchor-collision"
    | "relative-ref-resolved"
    | "required-non-string"
    | "schema-allof-incompatible"
    | "swagger-collection-format-dropped"
    | "swagger-cyclic-parameter-ref"
    | "swagger-invalid-file-parameter"
    | "swagger-malformed-oauth-flow"
    | "swagger-missing-consumes"
    | "swagger-missing-host"
    | "type-mismatch"
    | "type-negation-fallback"
    | "unknown-format"
    | "unknown-json-schema-dialect"
    | "unknown-keyword"
    | "unknown-openapi-version"
    | "unknown-parameter-location"
    | "unknown-security-scheme-type"
    | "unresolved-ref"
    | "unsupported-type"
    | "zod-codec-nested-output-only"
    | "zod-codec-output-only"
    | "zod-preprocess-output-only"
    | "zod-promise-nested-unwrap";

// ---------------------------------------------------------------------------
// Diagnostic structure
// ---------------------------------------------------------------------------

/**
 * A single diagnostic emitted during schema processing.
 *
 * @group Diagnostics
 */
export interface Diagnostic {
    /** Machine-readable code for programmatic handling. */
    code: DiagnosticCode;
    /** Human-readable description of the issue. */
    message: string;
    /** JSON Pointer to the schema node that triggered the diagnostic. */
    pointer: string;
    /** Additional context specific to the diagnostic code. */
    detail?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sink and options
// ---------------------------------------------------------------------------

/**
 * Callback that receives each diagnostic as it is emitted.
 *
 * @group Diagnostics
 */
export type DiagnosticSink = (d: Diagnostic) => void;

/**
 * Diagnostics configuration threaded through the processing pipeline.
 *
 * @group Diagnostics
 */
export interface DiagnosticsOptions {
    /**
     * Callback for receiving diagnostics. When omitted, diagnostics
     * are silently discarded (preserving backward compatibility).
     */
    diagnostics?: DiagnosticSink;

    /**
     * When `true`, any diagnostic is converted to a thrown
     * `SchemaCompatibilityError`. Useful in CI or strict mode
     * to catch schema drift early.
     */
    strict?: boolean;
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

/**
 * Emit a diagnostic through the configured sink.
 * When `strict` is enabled, throws a `SchemaCompatibilityError` instead.
 */
export function emitDiagnostic(
    opts: DiagnosticsOptions | undefined,
    diagnostic: Diagnostic
): void {
    if (opts?.strict === true) {
        throw new SchemaNormalisationError(
            `[${diagnostic.code}] ${diagnostic.message} (at ${diagnostic.pointer})`,
            diagnostic.detail,
            "unknown"
        );
    }

    if (opts?.diagnostics !== undefined) {
        opts.diagnostics(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// Build a JSON Pointer by appending a segment
// ---------------------------------------------------------------------------

/**
 * Append a segment to a JSON Pointer.
 * Encodes `/` and `~` per RFC 6901.
 */
export function appendPointer(base: string, segment: string): string {
    const escaped = segment.replace(/~/g, "~0").replace(/\//g, "~1");
    return base === "" ? `/${escaped}` : `${base}/${escaped}`;
}
