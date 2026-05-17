/**
 * Schema adapter — normalises all inputs to JSON Schema.
 *
 * - Zod 4 schemas → converted via z.toJSONSchema()
 * - Zod 3 schemas → error (not yet supported)
 * - JSON Schema objects → passed through
 * - OpenAPI documents → schemas extracted and passed through
 *
 * The adapter preserves the original Zod schema for validation.
 * All narrowing uses type guards — no type assertions.
 */

import { z } from "zod";
import type { JsonObject, SchemaMeta } from "./types.ts";
import { hasProperty, isObject, getProperty } from "./guards.ts";
import { dereference } from "./ref.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { emitDiagnostic } from "./diagnostics.ts";
import { SchemaNormalisationError } from "./errors.ts";
import type { JsonSchemaDraft } from "./version.ts";
import {
    inferJsonSchemaDraftWithReason,
    matchJsonSchemaDraftUri,
    detectOpenApiVersion,
    isSwagger2,
} from "./version.ts";
import {
    normaliseJsonSchema as normaliseForDraft,
    normaliseOpenApiSchemas,
} from "./normalise.ts";

// ---------------------------------------------------------------------------
// Schema cache — avoids redundant z.toJSONSchema() calls
// ---------------------------------------------------------------------------

const schemaCache = new WeakMap<object, NormalisedSchema>();

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { JsonObject, SchemaMeta };

export type SchemaInput = Record<string, unknown>;
export type SchemaKind =
    | "zod4"
    | "zod3"
    | "jsonSchema"
    | "openapi"
    | "unsupported-schema-lib";

// Type guards and safe access imported from core/guards.ts

// ---------------------------------------------------------------------------
// Schema detection
// ---------------------------------------------------------------------------

/**
 * Classify the input schema by its structural markers.
 *
 * - `zod4` — has a `_zod` marker (further validation that `_zod` is an
 *   object and `_zod.def` is a non-null object happens inside
 *   `normaliseZod4`).
 * - `zod3` — has `_def` and no `_zod`. The `typeName` field is no longer
 *   required: any `_def` without `_zod` is treated as a probable Zod 3
 *   schema. Third-party libraries that expose `_def` without `_zod` are
 *   nearly always Zod 3 forks; surfacing the migration message is the
 *   correct response.
 * - `openapi` — has `openapi` or `swagger` at the root.
 * - `unsupported-schema-lib` — has `parse` and `safeParse` callables but
 *   no `_zod` and no `_def` marker. This catches Standard Schema
 *   implementations (valibot, arktype, etc.) that would otherwise flow
 *   through as "malformed JSON Schema".
 * - `jsonSchema` — fallback for anything that does not match the above.
 */
export function detectSchemaKind(input: unknown): SchemaKind {
    if (hasProperty(input, "_zod")) return "zod4";
    if (hasProperty(input, "_def") && !hasProperty(input, "_zod"))
        return "zod3";
    if (hasProperty(input, "openapi") || hasProperty(input, "swagger"))
        return "openapi";
    if (isLikelyOtherSchemaLib(input)) return "unsupported-schema-lib";
    return "jsonSchema";
}

/**
 * Heuristic: a non-Zod object exposing both `.parse` and `.safeParse` as
 * callables is almost certainly an instance of a competing schema library
 * (Standard Schema, valibot, arktype, etc.). schema-components requires
 * Zod 4 throughout — surfacing the unsupported library by name beats
 * letting the input drop through to the JSON Schema branch where it
 * would fail as "malformed JSON Schema" without explanation.
 */
function isLikelyOtherSchemaLib(input: unknown): boolean {
    if (!isObject(input)) return false;
    if (hasProperty(input, "_zod") || hasProperty(input, "_def")) return false;
    const parse = input.parse;
    const safeParse = input.safeParse;
    return typeof parse === "function" && typeof safeParse === "function";
}

// ---------------------------------------------------------------------------
// Zod toJSONSchema wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps z.toJSONSchema() for a runtime-validated Zod schema.
 *
 * The _zod guard in normaliseZod4 has confirmed this is a valid Zod schema,
 * but TypeScript cannot represent "has _zod.def" as the $ZodType parameter
 * that z.toJSONSchema expects. This is the library boundary equivalent of
 * object → Record<string, unknown> — the type mismatch is genuinely unavoidable.
 *
 * # Options
 *
 * `z.toJSONSchema` is invoked with an explicit options object rather than
 * Zod's defaults so the conversion contract is pinned and stable:
 *
 * - `target: "draft-2020-12"` — matches the walker's draft target.
 * - `unrepresentable: "throw"` — keeps the unrepresentable-type rules in
 *   the classifier table firing instead of silently emitting `{}`.
 * - `cycles: "ref"` — converts cyclic graphs into $ref pairs rather than
 *   throwing. Cycles in user schemas surface through the walker's $ref
 *   resolution rather than the adapter.
 * - `io: "output"` — convert the OUTPUT side of every transform / pipe /
 *   codec. The input side is invisible to the converted schema, even
 *   though `safeParse` on the same Zod schema consumes the input shape.
 *   For transforms this divergence is fatal and the call throws via
 *   `Transforms cannot be represented`; for `z.codec(...)` the call
 *   succeeds but only the output side is rendered. Consumers receive a
 *   `zod-codec-output-only` diagnostic in the codec case so the
 *   asymmetry is visible — see `screenPreConversion`.
 *
 * # Error classification
 *
 * Any exception thrown by z.toJSONSchema is classified into a
 * SchemaNormalisationError so the caller does not have to re-parse error
 * message strings. The classification covers:
 *
 * - Nested Zod 3 schemas inside a Zod 4 tree → zod3-unsupported.
 *   Detected structurally (presence of `_def.typeName` markers anywhere
 *   in the schema tree) so the check works across V8, JavaScriptCore,
 *   and SpiderMonkey, none of which agree on the wording of
 *   "Cannot read properties of undefined".
 * - Transforms → zod-transform-unsupported. This also catches `z.codec(…)`
 *   because Zod implements codecs as a pipe + transform internally, so
 *   they trip the same processor when round-tripping is forced. (Plain
 *   `z.toJSONSchema(codec)` itself does NOT throw because Zod picks one
 *   side of the codec; the static rejection in `typeInference.ts` is the
 *   compile-time guard.)
 * - Dynamic catch values whose handler throws → zod-type-unrepresentable
 *   with zodType "dynamic-catch".
 * - Unrepresentable types — bigint, date, map, set, symbol, function, custom,
 *   undefined, void, NaN, and the literal-only forms `z.literal(undefined)`
 *   ("undefined-literal") and `z.literal(<bigint>)` ("bigint-literal") →
 *   zod-type-unrepresentable.
 * - The catch-all "Non-representable type encountered: <type>" fallback Zod
 *   emits for any new schema kind without a registered processor →
 *   zod-type-unrepresentable with zodType set to the offending def.type.
 * - Cycle detected (`cycles: "throw"`) → zod-cycle-detected.
 * - Duplicate schema id → zod-duplicate-id.
 * - "Unprocessed schema. This is a bug in Zod." → zod-conversion-bug.
 * - "Error converting schema to JSON." → zod-conversion-failed (explicit
 *   classification rather than the generic fallback so the contract test
 *   protects the prefix from drift).
 * - Anything else → zod-conversion-failed.
 *
 * The original error is preserved on each classified error via the `cause`
 * field so consumers can still inspect the Zod stack trace.
 */
function callToJsonSchema(schema: unknown): unknown {
    try {
        // @ts-expect-error — Library boundary: z.toJSONSchema requires $ZodType
        // but we have unknown validated by _zod guard. See function JSDoc.
        return z.toJSONSchema(schema, {
            target: "draft-2020-12",
            unrepresentable: "throw",
            cycles: "ref",
            io: "output",
        });
    } catch (err) {
        throw classifyZodConversionError(err, schema);
    }
}

// ---------------------------------------------------------------------------
// Pre-conversion screening
// ---------------------------------------------------------------------------

/**
 * Zod `def.type` tags that have no useful JSON Schema representation but
 * do NOT throw when passed through `z.toJSONSchema`. Each tag is handled
 * by Zod with a processor that silently rewrites the output:
 *
 * - `promise` — `promiseProcessor` unwraps the inner type, dropping the
 *   `Promise<...>` wrapper without any error. (`json-schema-processors.ts`,
 *   the body of `promiseProcessor` calls `process(def.innerType, ...)`.)
 *   schema-components considers this a silent shape mismatch — the input
 *   tree advertised a `Promise<T>` and the consumer would render `T`
 *   without ever being told the wrapping was lost.
 *
 * Detection happens BEFORE the call to `z.toJSONSchema` so the response is
 * an immediate `SchemaNormalisationError` with `kind:
 * "zod-type-unrepresentable"`, matching the philosophy of
 * `UnrepresentableZodType` in `typeInference.ts` — these types are
 * rejected, not coerced.
 */
const PRECONVERSION_UNREPRESENTABLE_TAGS: ReadonlyMap<string, string> = new Map(
    [
        [
            "promise",
            "z.promise(T) cannot be represented in JSON Schema. Zod silently " +
                "unwraps it to the inner type, which would leave the rendered " +
                "schema out of sync with the source. Resolve the promise at the " +
                "data boundary before passing the value to the component.",
        ],
    ]
);

/**
 * Pre-conversion screening. Inspects the root `_zod.def.type` tag for
 * known-problematic types that either silently misrender (handled via
 * {@link PRECONVERSION_UNREPRESENTABLE_TAGS}, raising a
 * `SchemaNormalisationError`) or render correctly but with consumer-visible
 * caveats (codecs, raising a `zod-codec-output-only` diagnostic).
 *
 * Design choice: `z.never()` is NOT classified here. The Zod processor for
 * `never` already produces `{ not: {} }`, which the walker understands via
 * its `walkBooleanSchema(false)` branch (`walker.ts` boolean-schema
 * handling). Throwing a `zod-type-unrepresentable` for `never` would break
 * the legitimate "this field cannot hold any value" use case that the
 * walker already supports. Documented for posterity so future passes do
 * not "fix" it.
 */
function screenPreConversion(
    input: unknown,
    def: Record<string, unknown>,
    diagnostics: DiagnosticsOptions | undefined
): void {
    const tag = def.type;
    if (typeof tag !== "string") return;

    const unrepresentableMessage = PRECONVERSION_UNREPRESENTABLE_TAGS.get(tag);
    if (unrepresentableMessage !== undefined) {
        throw new SchemaNormalisationError(
            unrepresentableMessage,
            input,
            "zod-type-unrepresentable",
            tag
        );
    }

    // Codec detection. Zod implements codecs as a specialised pipe — the
    // `def.type` is `"pipe"` and the schema's traits set contains
    // `"$ZodCodec"` (see `to-json-schema.ts` `isTransforming`). The
    // conversion succeeds with output-side semantics; the diagnostic
    // makes the asymmetry visible to consumers.
    if (tag === "pipe" && isCodecSchema(input)) {
        emitDiagnostic(diagnostics, {
            code: "zod-codec-output-only",
            message:
                "z.codec(...) was passed at the schema root. Only the OUTPUT " +
                "side is rendered by schema-components; the input side may " +
                "differ. If you intend to render the input side instead, " +
                "restructure the codec so the input type is the rendered shape.",
            pointer: "",
            detail: { zodType: "codec" },
        });
    }
}

/**
 * True when `input` is a `z.codec(...)` instance. Detection looks for the
 * `$ZodCodec` entry in `_zod.traits` — the same marker `z.toJSONSchema`'s
 * own `isTransforming` helper uses to distinguish codecs from generic
 * pipes.
 */
function isCodecSchema(input: unknown): boolean {
    const zod = getProperty(input, "_zod");
    if (!isObject(zod)) return false;
    const traits = zod.traits;
    if (traits instanceof Set) return traits.has("$ZodCodec");
    return false;
}

// ---------------------------------------------------------------------------
// Classifier rules — anchored regex matching against the live Zod wording.
// ---------------------------------------------------------------------------

/**
 * A single classifier rule. `prefix` is the verbatim wording from Zod that
 * uniquely identifies a thrown error. The classifier matches against the
 * start of the message using an anchored regex so an accidental rewording
 * by Zod (e.g. adding a leading namespace tag) fails loudly rather than
 * matching a different rule by substring overlap.
 *
 * `build` produces the structured SchemaNormalisationError for the rule.
 * The Zod-extracted captures (e.g. cycle path, duplicate id, def.type) are
 * passed through `match` so each rule can shape its message richly.
 */
interface ClassifierRule {
    readonly prefix: string;
    readonly kind: SchemaNormalisationError["kind"];
    readonly zodType?: string;
    readonly build: (
        match: RegExpExecArray,
        cause: unknown,
        schema: unknown,
        fullMessage: string
    ) => SchemaNormalisationError;
}

/**
 * Escape a string for inclusion in a `RegExp`. Required because Zod
 * messages contain `[`, `]`, `.`, `(`, and `)` characters which have regex
 * meaning. The set covers every character with special meaning in a
 * JavaScript regular-expression source — RegExp.escape is not yet widely
 * available so we escape manually.
 */
function escapeRegExp(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a prefix into an anchored regex that captures any trailing text
 * (used by rules that need to extract dynamic data such as the duplicate id
 * or the def.type that tripped the non-representable fallback).
 */
function anchored(prefix: string): RegExp {
    return new RegExp(`^${escapeRegExp(prefix)}(.*)$`, "s");
}

/**
 * Build the message body shared by every unrepresentable-type rule.
 */
function unrepresentableMessage(typeName: string, fullMessage: string): string {
    return (
        `Zod type ${typeName} cannot be represented in JSON Schema and is not supported by schema-components. ` +
        `Original message: ${fullMessage}`
    );
}

/**
 * Classifier rules ordered most-specific first. Order is load-bearing:
 * `Literal \`undefined\` cannot be represented` must precede the broader
 * `Undefined cannot be represented` so the literal classification wins
 * even when both share a leading word. A consistency check in the unit
 * test suite asserts no two `prefix` values are prefixes of each other —
 * any future rule that breaks the invariant fails the build.
 *
 * Verbatim sources (kept aligned with `tests/zod-error-wording-contract.unit.test.ts`):
 * - zod/src/v4/core/json-schema-processors.ts L104 (bigint), L110 (symbol),
 *   L126 (undefined), L132 (void), L150 (date), L169 (literal-undefined),
 *   L175 (literal-bigint), L204 (NaN), L246 (custom), L252 (function),
 *   L258 (transforms), L264 (map), L270 (set), L521 (dynamic catch).
 * - zod/src/v4/core/to-json-schema.ts L182 (non-representable type fallback),
 *   L225 + L364 (unprocessed schema), L235 (duplicate id), L307 (cycle),
 *   L522 (error converting).
 */
const CLASSIFIER_RULES: readonly ClassifierRule[] = [
    // Literal-only forms must precede their broader counterparts.
    {
        prefix: "Literal `undefined` cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "undefined-literal",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("undefined-literal", full),
                schema,
                "zod-type-unrepresentable",
                "undefined-literal",
                cause
            ),
    },
    {
        prefix: "BigInt literals cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "bigint-literal",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("bigint-literal", full),
                schema,
                "zod-type-unrepresentable",
                "bigint-literal",
                cause
            ),
    },
    {
        prefix: "BigInt cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "bigint",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("bigint", full),
                schema,
                "zod-type-unrepresentable",
                "bigint",
                cause
            ),
    },
    {
        prefix: "Date cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "date",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("date", full),
                schema,
                "zod-type-unrepresentable",
                "date",
                cause
            ),
    },
    {
        prefix: "Map cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "map",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("map", full),
                schema,
                "zod-type-unrepresentable",
                "map",
                cause
            ),
    },
    {
        prefix: "Set cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "set",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("set", full),
                schema,
                "zod-type-unrepresentable",
                "set",
                cause
            ),
    },
    {
        prefix: "Symbols cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "symbol",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("symbol", full),
                schema,
                "zod-type-unrepresentable",
                "symbol",
                cause
            ),
    },
    {
        prefix: "Function types cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "function",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("function", full),
                schema,
                "zod-type-unrepresentable",
                "function",
                cause
            ),
    },
    {
        prefix: "Custom types cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "custom",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("custom", full),
                schema,
                "zod-type-unrepresentable",
                "custom",
                cause
            ),
    },
    {
        prefix: "Undefined cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "undefined",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("undefined", full),
                schema,
                "zod-type-unrepresentable",
                "undefined",
                cause
            ),
    },
    {
        prefix: "Void cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "void",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("void", full),
                schema,
                "zod-type-unrepresentable",
                "void",
                cause
            ),
    },
    {
        prefix: "NaN cannot be represented",
        kind: "zod-type-unrepresentable",
        zodType: "nan",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                unrepresentableMessage("nan", full),
                schema,
                "zod-type-unrepresentable",
                "nan",
                cause
            ),
    },
    {
        prefix: "Transforms cannot be represented",
        kind: "zod-transform-unsupported",
        build: (_m, cause, schema) =>
            new SchemaNormalisationError(
                "Zod transforms cannot be represented in JSON Schema. " +
                    "Remove the .transform() call, or pre-transform the input before " +
                    "passing it to the component. (Note: z.codec(...) is implemented " +
                    "as a transform internally — codecs that force round-tripping trip " +
                    "this same rule.)",
                schema,
                "zod-transform-unsupported",
                undefined,
                cause
            ),
    },
    {
        prefix: "Dynamic catch values are not supported",
        kind: "zod-type-unrepresentable",
        zodType: "dynamic-catch",
        build: (_m, cause, schema) =>
            new SchemaNormalisationError(
                "Zod catch values that depend on runtime computation cannot be " +
                    "represented in JSON Schema. Provide a static catch value or " +
                    "remove the .catch() call.",
                schema,
                "zod-type-unrepresentable",
                "dynamic-catch",
                cause
            ),
    },
    {
        // `[toJSONSchema]: Non-representable type encountered: ${def.type}`
        prefix: "[toJSONSchema]: Non-representable type encountered:",
        kind: "zod-type-unrepresentable",
        build: (match, cause, schema, full) => {
            // The captured group contains everything after the colon. Trim
            // and keep the first whitespace-delimited token so additional
            // context appended in future Zod versions does not bleed into
            // the zodType field.
            const trailing = match[1]?.trim() ?? "";
            const typeName =
                trailing.length > 0 ? trailing.split(/\s+/)[0] : undefined;
            return new SchemaNormalisationError(
                `Zod encountered a schema kind${typeName !== undefined ? ` "${typeName}"` : ""} ` +
                    `with no JSON Schema processor registered. ` +
                    `This usually means Zod added a new schema type that schema-components ` +
                    `does not yet support. Original message: ${full}`,
                schema,
                "zod-type-unrepresentable",
                typeName,
                cause
            );
        },
    },
    {
        // `Cycle detected: #/...\n\nSet the cycles parameter to "ref" ...`
        prefix: "Cycle detected: ",
        kind: "zod-cycle-detected",
        build: (match, cause, schema, full) => {
            const trailing = match[1] ?? "";
            // Path is the first whitespace-delimited token (the JSON Pointer
            // up to the trailing newline that Zod inserts before the advice).
            const path = trailing.split(/\s+/)[0] ?? "";
            return new SchemaNormalisationError(
                `Zod detected a cycle in the schema graph at ${path}. ` +
                    `schema-components calls z.toJSONSchema with { cycles: "ref" } ` +
                    `so legitimate cyclic graphs convert to $ref pairs; this error ` +
                    `surfaces only when Zod is unable to break the cycle even under ` +
                    `the "ref" policy. Restructure the schema to break the cycle, ` +
                    `or use an explicit $ref-based definition. Original message: ${full}`,
                schema,
                "zod-cycle-detected",
                undefined,
                cause
            );
        },
    },
    {
        // `Duplicate schema id "${id}" detected during JSON Schema conversion. ...`
        prefix: 'Duplicate schema id "',
        kind: "zod-duplicate-id",
        build: (match, cause, schema, full) => {
            const trailing = match[1] ?? "";
            // The id is delimited by the closing double-quote that follows.
            const closing = trailing.indexOf('"');
            const id = closing === -1 ? trailing : trailing.slice(0, closing);
            return new SchemaNormalisationError(
                `Two different Zod schemas share the same id "${id}". ` +
                    `JSON Schema requires distinct ids when multiple schemas are ` +
                    `bundled together. Give each schema its own .meta({ id: ... }) ` +
                    `or remove the duplicate. Original message: ${full}`,
                schema,
                "zod-duplicate-id",
                undefined,
                cause
            );
        },
    },
    {
        // `Unprocessed schema. This is a bug in Zod.`
        prefix: "Unprocessed schema. This is a bug in Zod.",
        kind: "zod-conversion-bug",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                "Zod failed to process this schema during JSON Schema conversion " +
                    "and reports it as an internal bug. File an issue on the Zod " +
                    "tracker with a reproduction. " +
                    `Original message: ${full}`,
                schema,
                "zod-conversion-bug",
                undefined,
                cause
            ),
    },
    {
        // `Error converting schema to JSON.`
        prefix: "Error converting schema to JSON.",
        kind: "zod-conversion-failed",
        build: (_m, cause, schema, full) =>
            new SchemaNormalisationError(
                `z.toJSONSchema() failed to produce a Standard Schema payload. ` +
                    `Inspect the underlying cause for the original error. ` +
                    `Original message: ${full}`,
                schema,
                "zod-conversion-failed",
                undefined,
                cause
            ),
    },
];

/**
 * Compiled regex form of {@link CLASSIFIER_RULES} — built once at module
 * load. Avoids per-error compilation.
 */
const COMPILED_CLASSIFIER_RULES: readonly {
    readonly rule: ClassifierRule;
    readonly pattern: RegExp;
}[] = CLASSIFIER_RULES.map((rule) => ({
    rule,
    pattern: anchored(rule.prefix),
}));

/**
 * Maximum recursion depth for {@link containsNestedZod3}. Mirrors the
 * type-level `DEFAULT_MAX_DEPTH` in `typeInference.ts` (currently `64`) so
 * the runtime walk and the compile-time walker agree on the limit. The
 * constant is duplicated here rather than imported because
 * `typeInference.ts` exports the value as a TypeScript type only — there
 * is no runtime export to consume.
 */
const NESTED_ZOD3_MAX_DEPTH = 64;

/**
 * Walk an arbitrary value looking for Zod 3 markers (`_def` without
 * `_zod`). Zod 4 schemas always carry `_zod.def`; Zod 3 schemas carry
 * `_def` (with or without a `typeName` field — third-party Zod-3-style
 * libraries occasionally omit `typeName`). Presence of `_def` without
 * `_zod` anywhere in the tree means a Zod 3 (or Zod-3-like) schema was
 * nested inside a Zod 4 input, which is what trips the V8
 * `"Cannot read properties of undefined"` failure.
 *
 * Engine-agnostic by construction — the detector inspects schema shape
 * instead of pattern-matching against the runtime's TypeError message,
 * so it works equivalently under V8, JavaScriptCore (Bun/Safari), and
 * SpiderMonkey (Firefox) — none of which agree on the wording.
 *
 * Performance shortcuts:
 *
 * - **Targeted descent into Zod 4 nodes.** Once a node is identified as a
 *   Zod 4 schema (`_zod.def` is an object), the only branch that can
 *   carry user-supplied sub-schemas is `_zod.def` itself. Zod's other
 *   internal members (`_zod.traits`, `_zod.parse`, `_zod.bag`, etc.) are
 *   implementation surface and never contain user schemas, so walking
 *   them on every conversion failure is wasted work. Switching to a
 *   targeted descent (only `_zod.def` plus the schema root's `_def`
 *   field) trims the walk dramatically.
 * - **Depth cap.** Recursion is bounded by {@link NESTED_ZOD3_MAX_DEPTH}
 *   so a pathological schema graph cannot cause stack overflow. The
 *   `visited` set still defends against cyclic references; the depth
 *   cap defends against deep-but-acyclic trees.
 */
function containsNestedZod3(value: unknown, visited: Set<object>): boolean {
    return containsNestedZod3Inner(value, visited, 0);
}

function containsNestedZod3Inner(
    value: unknown,
    visited: Set<object>,
    depth: number
): boolean {
    if (depth >= NESTED_ZOD3_MAX_DEPTH) return false;
    if (value === null || typeof value !== "object") return false;
    if (visited.has(value)) return false;
    visited.add(value);

    if (Array.isArray(value)) {
        for (const item of value) {
            if (containsNestedZod3Inner(item, visited, depth + 1)) return true;
        }
        return false;
    }

    // After the array check, narrow to the indexable record form so we can
    // probe `_def` / `_zod` without cast. `isObject` rejects arrays and
    // `null` and produces `Record<string, unknown>`.
    if (!isObject(value)) return false;

    const def = value._def;
    const zod = value._zod;

    // Zod 3 marker: `_def` without `_zod`. Issue 8 — `typeName` is no
    // longer required because third-party Zod-3-style schema libraries
    // sometimes omit it; any `_def`-bearing object without `_zod` is
    // treated as evidence of nested Zod 3 / unsupported schema.
    if (zod === undefined && isObject(def)) {
        return true;
    }

    // Targeted descent for Zod 4 nodes. All user-supplied child schemas
    // live under `_zod.def`; walking the other `_zod.*` members would
    // descend into traits Sets, parser closures, and back-pointers that
    // never contain Zod 3 schemas. Recurse only into `_zod.def`.
    if (isObject(zod) && isObject(zod.def)) {
        return containsNestedZod3Inner(zod.def, visited, depth + 1);
    }

    // Non-Zod nodes — walk every own key. This branch handles plain
    // objects/arrays that wrap or contain schemas (e.g. user-supplied
    // option objects, the shape map of a Zod object, etc.).
    for (const key of Object.keys(value)) {
        if (containsNestedZod3Inner(value[key], visited, depth + 1))
            return true;
    }
    return false;
}

function classifyZodConversionError(
    err: unknown,
    schema: unknown
): SchemaNormalisationError {
    const message = err instanceof Error ? err.message : String(err);

    // Nested Zod 3 — detected structurally on the input schema so the
    // detection works across JavaScript engines whose TypeError wording
    // differs (V8 says "Cannot read properties of undefined", Bun/JSC
    // says "undefined is not an object", SpiderMonkey says "undefined
    // has no properties"). Match on the input rather than the message
    // and the classification holds on every runtime.
    if (containsNestedZod3(schema, new Set())) {
        return new SchemaNormalisationError(
            "A nested Zod 3 schema was found inside a Zod 4 schema. " +
                "schema-components requires Zod 4 throughout the schema tree. " +
                "See the Zod 4 migration guide at https://zod.dev/v4/migration " +
                "or run: pnpm add zod@^4",
            schema,
            "zod3-unsupported",
            undefined,
            err
        );
    }

    // Anchored regex match — the first rule whose prefix matches wins.
    // Because the rules are pre-sorted most-specific first AND the unit
    // test asserts no two prefixes are prefixes of each other, the match
    // is unambiguous.
    for (const { rule, pattern } of COMPILED_CLASSIFIER_RULES) {
        const match = pattern.exec(message);
        if (match !== null) {
            return rule.build(match, err, schema, message);
        }
    }

    // Anything else — preserve the original message but classify it as a
    // generic conversion failure.
    return new SchemaNormalisationError(
        `z.toJSONSchema() failed: ${message}`,
        schema,
        "zod-conversion-failed",
        undefined,
        err
    );
}

/**
 * Exposed for unit testing — lets the contract test enumerate every rule's
 * `prefix` value and assert mutual non-prefixing.
 */
export const __CLASSIFIER_RULES_FOR_TEST: readonly {
    readonly prefix: string;
}[] = CLASSIFIER_RULES;

// ---------------------------------------------------------------------------
// Schema normalisation — synchronous
// ---------------------------------------------------------------------------

export interface NormalisedSchema {
    /** JSON Schema object — the authoritative schema for rendering. */
    jsonSchema: JsonObject;
    /** Original Zod schema, if input was Zod. Used for validation. */
    zodSchema?: unknown;
    /** Root-level metadata. */
    rootMeta: SchemaMeta | undefined;
    /** The root document for $ref resolution. */
    rootDocument: JsonObject;
}

export interface NormaliseOptions {
    /** Diagnostics channel for surfacing silent fallbacks. */
    diagnostics?: DiagnosticsOptions;
}

export function normaliseSchema(
    input: unknown,
    ref?: string,
    options?: NormaliseOptions
): NormalisedSchema {
    // Cache lookup for object identity (Zod schemas, JSON Schema objects).
    // Only cache when no ref is provided — refs produce different results.
    //
    // When a `diagnostics` sink is supplied we bypass the cache entirely
    // (mirroring `getParsed` in `openapi/resolve.ts`). The cached result
    // captured a previous normalisation that did not observe the new sink;
    // returning it would silently swallow every diagnostic the consumer
    // expects to see. Re-running normalisation is the only way to surface
    // diagnostics to a new sink.
    const usesDiagnostics = options?.diagnostics !== undefined;
    const cacheEligible =
        ref === undefined && isObject(input) && !usesDiagnostics;
    if (cacheEligible) {
        const cached = schemaCache.get(input);
        if (cached !== undefined) return cached;
    }

    const kind = detectSchemaKind(input);

    let result: NormalisedSchema;

    switch (kind) {
        case "zod4":
            result = normaliseZod4(input, options?.diagnostics);
            break;
        case "zod3":
            result = normaliseZod3(input);
            break;
        case "unsupported-schema-lib":
            throw new SchemaNormalisationError(
                "Input looks like a schema from a non-Zod library — it exposes " +
                    "`parse` and `safeParse` but carries no Zod 4 (`_zod`) or " +
                    "Zod 3 (`_def`) marker. schema-components requires a Zod 4 " +
                    "schema. Convert the schema with the equivalent Zod 4 builder, " +
                    "or feed schema-components a JSON Schema / OpenAPI document " +
                    "instead. See the Zod 4 contract at https://zod.dev/v4 or " +
                    "run: pnpm add zod@^4",
                input,
                "unsupported-schema"
            );
        case "openapi":
            if (!isObject(input)) {
                throw new SchemaNormalisationError(
                    "Invalid OpenAPI document",
                    input,
                    "openapi-invalid"
                );
            }
            result = normaliseOpenApi(input, ref, options);
            break;
        case "jsonSchema":
            if (!isObject(input)) {
                throw new SchemaNormalisationError(
                    "Invalid JSON Schema",
                    input,
                    "invalid-json-schema"
                );
            }
            result = normaliseJsonSchema(input, options?.diagnostics);
            break;
    }

    // Cache for future calls (same object identity, no ref, no sink).
    // Cache population deliberately mirrors the eligibility check above —
    // diagnostics-bearing parses are never cached for the same reason
    // they bypass the lookup.
    if (cacheEligible) {
        schemaCache.set(input, result);
    }

    return result;
}

function normaliseZod4(
    input: unknown,
    diagnostics?: DiagnosticsOptions
): NormalisedSchema {
    // z.toJSONSchema() converts Zod → JSON Schema losslessly.
    // detectSchemaKind confirmed _zod is present, but the marker may be a
    // half-constructed sentinel (e.g. a test double of the form
    // `{ _zod: true }`). Require `_zod` to be a non-null object AND
    // `_zod.def` to be a non-null object — anything else is not a valid
    // Zod 4 schema and is classified explicitly as `unsupported-schema`
    // so the consumer is pointed at the Zod 4 contract rather than the
    // older, less specific `invalid-zod`.
    const zod = getProperty(input, "_zod");
    if (!isObject(zod)) {
        throw new SchemaNormalisationError(
            "Input is not a valid Zod 4 schema: `_zod` is present but is not an object. " +
                "schema-components expected a Zod 4 schema produced by the `zod` package " +
                "version 4 or later. See the Zod 4 migration guide at " +
                "https://zod.dev/v4/migration or run: pnpm add zod@^4",
            input,
            "unsupported-schema"
        );
    }
    const def = getProperty(zod, "def");
    if (!isObject(def)) {
        throw new SchemaNormalisationError(
            "Input is not a valid Zod 4 schema: `_zod.def` is missing or not an object. " +
                "schema-components expected a Zod 4 schema produced by the `zod` package " +
                "version 4 or later. See the Zod 4 migration guide at " +
                "https://zod.dev/v4/migration or run: pnpm add zod@^4",
            input,
            "unsupported-schema"
        );
    }

    // Detect unrepresentable or warning-only Zod types BEFORE handing the
    // schema to `z.toJSONSchema`. Some types (e.g. `z.promise(T)`) are
    // silently unwrapped by Zod's processors — the output would lose the
    // wrapping without any error fired, leaving consumers with a
    // shape-mismatched schema. Pre-conversion classification surfaces the
    // mismatch loudly. See `screenPreConversion` JSDoc.
    screenPreConversion(input, def, diagnostics);

    // Call toJSONSchema with the validated schema.
    // callToJsonSchema classifies any thrown exception into a
    // SchemaNormalisationError before it leaves this function.
    const jsonSchema: unknown = callToJsonSchema(input);
    if (!isObject(jsonSchema)) {
        throw new SchemaNormalisationError(
            "z.toJSONSchema() did not produce an object",
            input,
            "invalid-zod"
        );
    }

    return {
        jsonSchema,
        zodSchema: input,
        rootMeta: extractRootMetaFromJson(jsonSchema),
        rootDocument: jsonSchema,
    };
}

function normaliseJsonSchema(
    jsonSchema: JsonObject,
    diagnostics?: DiagnosticsOptions
): NormalisedSchema {
    let draft: JsonSchemaDraft;
    const $schema = jsonSchema.$schema;

    if (typeof $schema !== "string") {
        const inferred = inferJsonSchemaDraftWithReason(jsonSchema);
        draft = inferred.draft;
        emitDiagnostic(diagnostics, {
            code: "assumed-draft",
            message: `No $schema present; inferred ${inferred.draft} from keywords (${inferred.inferredFrom})`,
            pointer: "",
            detail: {
                inferredFrom: inferred.inferredFrom,
                draft: inferred.draft,
            },
        });
    } else {
        const matched = matchJsonSchemaDraftUri($schema);
        if (matched === undefined) {
            // `$schema` is present but unrecognised — fall back to the
            // 2020-12 normaliser (matching `detectJsonSchemaDraft`) and
            // surface the assumption so callers can act on it. Mirrors
            // the missing-$schema diagnostic path.
            draft = "draft-2020-12";
            emitDiagnostic(diagnostics, {
                code: "assumed-draft",
                message: `Unknown $schema URI "${$schema}"; assuming draft-2020-12`,
                pointer: "",
                detail: {
                    inferredFrom: "unknown-uri",
                    draft,
                    uri: $schema,
                },
            });
        } else {
            draft = matched;
        }
    }

    const normalised = normaliseForDraft(jsonSchema, draft, diagnostics);
    return {
        jsonSchema: normalised,
        rootMeta: extractRootMetaFromJson(normalised),
        rootDocument: normalised,
    };
}

function normaliseZod3(input: unknown): never {
    throw new SchemaNormalisationError(
        "Zod 3 schemas are not supported. schema-components requires Zod 4. " +
            "Detected: Zod 3 (has _def without _zod). " +
            "See the Zod 4 migration guide at https://zod.dev/v4/migration or " +
            "run: pnpm add zod@^4",
        input,
        "zod3-unsupported"
    );
}

// ---------------------------------------------------------------------------
// Swagger 2.0 ref prefix rewrites (adapter layer)
// ---------------------------------------------------------------------------

/**
 * Mapping of Swagger 2.0 $ref prefixes to their OpenAPI 3.x equivalents.
 * Used by the adapter to rewrite user-provided ref strings so they
 * resolve correctly against the normalised document.
 */
const REF_REWRITES_ADAPTER: readonly [string, string][] = [
    ["#/definitions/", "#/components/schemas/"],
    ["#/parameters/", "#/components/parameters/"],
    ["#/responses/", "#/components/responses/"],
];

function normaliseOpenApi(
    doc: JsonObject,
    ref: string | undefined,
    options?: NormaliseOptions
): NormalisedSchema {
    const version = detectOpenApiVersion(doc);
    const normalisedDoc =
        version !== undefined
            ? normaliseOpenApiSchemas(doc, version, options?.diagnostics)
            : doc;

    // Rewrite Swagger 2.0 ref prefixes to match the normalised document
    // structure (definitions → components/schemas, etc.)
    let rewrittenRef = ref;
    if (
        rewrittenRef !== undefined &&
        version !== undefined &&
        isSwagger2(version)
    ) {
        for (const [from, to] of REF_REWRITES_ADAPTER) {
            if (rewrittenRef.startsWith(from)) {
                rewrittenRef = to + rewrittenRef.slice(from.length);
                break;
            }
        }
    }

    const resolved = resolveOpenApiRef(normalisedDoc, rewrittenRef);
    return {
        jsonSchema: resolved,
        rootMeta: extractRootMetaFromJson(resolved),
        rootDocument: normalisedDoc,
    };
}

// ---------------------------------------------------------------------------
// OpenAPI ref resolution
// ---------------------------------------------------------------------------

function resolveOpenApiRef(
    doc: JsonObject,
    ref: string | undefined
): JsonObject {
    if (ref === undefined) {
        const components = getProperty(doc, "components");
        const schemas = getProperty(components, "schemas");
        if (!isObject(schemas)) {
            throw new Error(
                "OpenAPI document has no components/schemas and no ref was provided."
            );
        }
        const keys = Object.keys(schemas);
        const firstKey = keys[0];
        if (firstKey === undefined)
            throw new Error("OpenAPI document has empty components/schemas.");
        const first = schemas[firstKey];
        if (!isObject(first)) throw new Error("Schema is not an object.");
        return first;
    }

    // #/components/schemas/Name
    if (ref.startsWith("#/components/schemas/")) {
        const name = ref.slice("#/components/schemas/".length);
        const components = getProperty(doc, "components");
        const schemas = getProperty(components, "schemas");
        if (!isObject(schemas))
            throw new Error(`OpenAPI ref not found: ${ref}`);
        const resolved = schemas[name];
        if (!isObject(resolved))
            throw new Error(`OpenAPI ref not found: ${ref}`);
        return resolved;
    }

    // /path/method — extract request body schema
    const pathMatch =
        /^\/(.+)\/(get|post|put|patch|delete|head|options|trace)$/.exec(ref);
    if (pathMatch?.[1] !== undefined && pathMatch[2] !== undefined) {
        const pathStr = pathMatch[1];
        const method = pathMatch[2];
        const paths = getProperty(doc, "paths");
        if (!isObject(paths)) throw new Error("OpenAPI document has no paths.");
        const pathObj = paths[`/${pathStr}`];
        if (!isObject(pathObj)) throw new Error(`Path not found: /${pathStr}`);
        const operation = pathObj[method];
        if (!isObject(operation))
            throw new Error(`Method ${method} not found on /${pathStr}`);
        const requestBody = getProperty(operation, "requestBody");
        if (!isObject(requestBody))
            throw new Error(`No requestBody for ${ref}`);
        const content = getProperty(requestBody, "content");
        if (!isObject(content)) throw new Error(`No content for ${ref}`);
        const json = getProperty(content, "application/json");
        const multipart = getProperty(content, "multipart/form-data");
        const mediaType = isObject(json)
            ? json
            : isObject(multipart)
              ? multipart
              : undefined;
        if (mediaType === undefined) throw new Error(`No content for ${ref}`);
        const schema = getProperty(mediaType, "schema");
        if (!isObject(schema))
            throw new Error(`Could not resolve request body schema for ${ref}`);
        return schema;
    }

    // Fallback: try JSON Pointer dereference for any #/... ref
    if (ref.startsWith("#/")) {
        const resolved = dereference(ref, doc);
        if (resolved !== undefined) return resolved;
    }

    throw new Error(`Unsupported OpenAPI ref format: ${ref}`);
}

// ---------------------------------------------------------------------------
// Root meta extraction
// ---------------------------------------------------------------------------

function extractRootMetaFromJson(
    jsonSchema: JsonObject
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
