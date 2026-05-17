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
 */
export type DiagnosticCode =
    | "unresolved-ref"
    | "unknown-keyword"
    | "unknown-format"
    | "invalid-const"
    | "unsupported-type"
    | "dropped-swagger-feature"
    | "external-ref"
    | "type-negation-fallback"
    | "conditional-fallback"
    | "assumed-draft"
    | "depth-exceeded"
    | "allof-conflict"
    | "discriminator-inconsistent"
    | "divisible-by-conflict"
    | "legacy-dependencies-split"
    | "dependent-required-invalid"
    | "unknown-json-schema-dialect";

// ---------------------------------------------------------------------------
// Diagnostic structure
// ---------------------------------------------------------------------------

/**
 * A single diagnostic emitted during schema processing.
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
 */
export type DiagnosticSink = (d: Diagnostic) => void;

/**
 * Diagnostics configuration threaded through the processing pipeline.
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
