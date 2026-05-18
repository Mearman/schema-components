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
import { MAX_REF_DEPTH } from "./limits.ts";
import { dereference } from "./ref.ts";
import type { DiagnosticsOptions } from "./diagnostics.ts";
import { emitDiagnostic, appendPointer } from "./diagnostics.ts";
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
 * - `zod4` — has a `_zod` marker (further validation that `_zod.def` is a
 *   non-null object happens inside `normaliseZod4`).
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
 * Heuristic: a non-Zod object that exposes either a Standard Schema
 * `~standard.validate` entry point (valibot, arktype, and any pure
 * Standard-Schema-conformant library) or both legacy `.parse`/`.safeParse`
 * callables is almost certainly an instance of a competing schema
 * library. schema-components requires Zod 4 throughout — surfacing the
 * unsupported library by name beats letting the input drop through to
 * the JSON Schema branch where it would fail as "malformed JSON Schema"
 * without explanation.
 *
 * Standard Schema detection takes priority: the spec mandates a
 * `~standard` property carrying `{ validate, vendor, version }`. Pure
 * Standard Schema implementations may not expose any `.parse`/`.safeParse`
 * surface (those are a Zod / convenience API, not part of the spec), so
 * the legacy heuristic alone would miss them. See
 * https://standardschema.dev/ for the contract.
 */
function isLikelyOtherSchemaLib(input: unknown): boolean {
    if (!isObject(input)) return false;
    if (hasProperty(input, "_zod") || hasProperty(input, "_def")) return false;
    if (isObject(input["~standard"])) return true;
    const parse = input.parse;
    const safeParse = input.safeParse;
    return typeof parse === "function" && typeof safeParse === "function";
}

/**
 * Extract the Standard Schema vendor string from a non-Zod input, when
 * present. Returns `undefined` if the input does not advertise itself
 * via the `~standard.vendor` field. Used to enrich the
 * `unsupported-schema` error message with the library name so the
 * consumer knows whether they have valibot, arktype, or another
 * implementation in front of them.
 */
function extractStandardSchemaVendor(input: unknown): string | undefined {
    const standard = getProperty(input, "~standard");
    const vendor = getProperty(standard, "vendor");
    return typeof vendor === "string" && vendor.length > 0 ? vendor : undefined;
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
 * - `io` — selects which side of every transform / pipe / codec is
 *   converted. Defaults to `"output"` (the OUTPUT side); pass `"input"`
 *   to render the INPUT side instead. The input side is invisible to
 *   the converted schema when `io: "output"` is in force, even though
 *   `safeParse` on the same Zod schema consumes the input shape. For
 *   transforms this divergence is fatal and the call throws via
 *   `Transforms cannot be represented`; for `z.codec(...)` the call
 *   succeeds but only the selected side is rendered. Consumers receive
 *   a `zod-codec-output-only` diagnostic in the codec case so the
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
 * they trip the same processor when round-tripping is forced. (Plain
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
/**
 * IO side passed to {@link callToJsonSchema}. The Zod runtime accepts
 * `"input" | "output"` for the corresponding `io` option on
 * `z.toJSONSchema`. Defaults to `"output"` everywhere in the adapter
 * pipeline; the parameter exists so a future renderer or component
 * (currently SchemaComponent — see TODO below) can request the input
 * side without forking the helper.
 */
export type SchemaIoSide = "input" | "output";

// TODO(round7-integration): thread `io` through `normaliseSchema` →
// `normaliseZod4` so SchemaComponent (Agent G) can expose an `io` prop
// that selects which side of every transform / pipe / codec is rendered.
// Wiring stops at this helper for now to keep agent ownership clean;
// the helper itself is parameterised so the integration is a one-line
// change once Agent G's prop lands.
function callToJsonSchema(
    schema: unknown,
    io: SchemaIoSide = "output"
): unknown {
    try {
        // @ts-expect-error — Library boundary: z.toJSONSchema requires $ZodType
        // but we have unknown validated by _zod guard. See function JSDoc.
        return z.toJSONSchema(schema, {
            target: "draft-2020-12",
            unrepresentable: "throw",
            cycles: "ref",
            io,
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
 * Pre-conversion screening. Walks the entire Zod schema tree looking for
 * silently-misrendered or caveat-bearing constructs and surfaces each as
 * either a hard rejection (raised as a `SchemaNormalisationError`) or a
 * diagnostic on the configured sink:
 *
 * - `z.promise(T)` at any depth → rejection (see
 *   {@link PRECONVERSION_UNREPRESENTABLE_TAGS}). Each nested occurrence
 *   first emits a `zod-promise-nested-unwrap` diagnostic so consumers
 *   with a sink see every offending location before the throw fires.
 *   The root occurrence still throws via the same path so behaviour is
 *   uniform regardless of position in the tree.
 * - `z.codec(...)` at the root → `zod-codec-output-only` diagnostic.
 * - `z.codec(...)` nested below the root →
 *   `zod-codec-nested-output-only` diagnostic per occurrence.
 * - `z.preprocess(...)` at any depth → `zod-preprocess-output-only`
 *   diagnostic per occurrence. Preprocess never throws inside Zod (it
 *   silently rewrites to the output side), so the diagnostic is the
 *   only consumer-visible signal.
 *
 * Detection is structural — `_zod.def.type` plus `_zod.traits` (where
 * present) — and is depth-capped via {@link MAX_REF_DEPTH} with a
 * `visited` set to defend against cyclic graphs. JSON-pointer fragments
 * are accumulated as the walk descends so diagnostics report the exact
 * subschema location rather than `""`.
 *
 * Design choice: `z.never()` is NOT classified here. The Zod processor
 * for `never` already produces `{ not: {} }`, which the walker
 * understands via its `walkBooleanSchema(false)` branch (`walker.ts`
 * boolean-schema handling). Throwing a `zod-type-unrepresentable` for
 * `never` would break the legitimate "this field cannot hold any value"
 * use case that the walker already supports. Documented for posterity
 * so future passes do not "fix" it.
 */
function screenPreConversion(
    input: unknown,
    diagnostics: DiagnosticsOptions | undefined
): void {
    let rejection: SchemaNormalisationError | undefined;
    const visited = new Set<object>();
    screenPreConversionWalk(input, "", 0, true, visited, diagnostics, (err) => {
        // First rejection wins so the originally-raised location is
        // preserved for diagnostics. Subsequent rejections are
        // dropped; the diagnostic sink already records every
        // occurrence individually.
        rejection ??= err;
    });
    if (rejection !== undefined) throw rejection;
}

/**
 * Inner recursion for {@link screenPreConversion}. Visits every Zod
 * node reachable from `node`, emitting diagnostics and capturing
 * rejections through `recordRejection`. The walk is targeted: only
 * `_zod.def` is descended into (sibling `_zod.*` members are
 * implementation surface and never carry user schemas — same rule as
 * {@link containsNestedZod3Inner}).
 *
 * The `pointer` parameter tracks the JSON Pointer to the current
 * subschema so diagnostics carry an accurate location. The `isRoot`
 * flag distinguishes the entry call from recursive descents so
 * `zod-codec-output-only` (root) and `zod-codec-nested-output-only`
 * (nested) fire from the same code path.
 */
function screenPreConversionWalk(
    node: unknown,
    pointer: string,
    depth: number,
    isRoot: boolean,
    visited: Set<object>,
    diagnostics: DiagnosticsOptions | undefined,
    recordRejection: (err: SchemaNormalisationError) => void
): void {
    if (depth >= MAX_REF_DEPTH) return;
    if (!isObject(node)) return;
    if (visited.has(node)) return;
    visited.add(node);

    const zod = getProperty(node, "_zod");
    if (!isObject(zod)) return;
    const def = getProperty(zod, "def");
    if (!isObject(def)) return;

    const tag = def.type;

    // Hard-reject classifications. Promise is silently unwrapped by
    // Zod's `promiseProcessor`; emit a diagnostic per occurrence so the
    // exact location surfaces on the sink, then record the rejection.
    if (typeof tag === "string") {
        const unrepresentableMessage =
            PRECONVERSION_UNREPRESENTABLE_TAGS.get(tag);
        if (unrepresentableMessage !== undefined) {
            if (tag === "promise") {
                emitDiagnostic(diagnostics, {
                    code: "zod-promise-nested-unwrap",
                    message:
                        `z.promise(...) detected at ${formatPointer(pointer)}. ` +
                        "Zod silently unwraps it to the inner type, which would " +
                        "leave the rendered schema out of sync with the source. " +
                        "Resolve the promise at the data boundary before passing " +
                        "the value to the component.",
                    pointer,
                    detail: { zodType: "promise" },
                });
            }
            recordRejection(
                new SchemaNormalisationError(
                    unrepresentableMessage,
                    node,
                    "zod-type-unrepresentable",
                    tag
                )
            );
            // Continue the walk — additional nested occurrences should
            // still surface as diagnostics for full visibility.
        }
    }

    // Codec detection. Zod implements codecs as a specialised pipe —
    // `def.type === "pipe"` plus a `$ZodCodec` trait (see
    // `to-json-schema.ts` `isTransforming`). Root and nested occurrences
    // use distinct diagnostic codes so consumers can branch on them.
    if (tag === "pipe" && hasTrait(zod, "$ZodCodec")) {
        if (isRoot) {
            emitDiagnostic(diagnostics, {
                code: "zod-codec-output-only",
                message:
                    "z.codec(...) was passed at the schema root. Only the OUTPUT " +
                    "side is rendered by schema-components; the input side may " +
                    "differ. If you intend to render the input side instead, " +
                    "restructure the codec so the input type is the rendered shape.",
                pointer,
                detail: { zodType: "codec" },
            });
        } else {
            emitDiagnostic(diagnostics, {
                code: "zod-codec-nested-output-only",
                message:
                    `z.codec(...) detected at ${formatPointer(pointer)}. Only the ` +
                    "OUTPUT side is rendered by schema-components; the input side " +
                    "is invisible to the converted schema even though safeParse " +
                    "still consumes the input shape.",
                pointer,
                detail: { zodType: "codec" },
            });
        }
    }

    // Preprocess detection. `z.preprocess(...)` is also a pipe under
    // the hood, marked with the `$ZodPreprocess` trait. Zod silently
    // rewrites the schema to the output side, so we emit a single
    // diagnostic code for both root and nested cases.
    if (tag === "pipe" && hasTrait(zod, "$ZodPreprocess")) {
        emitDiagnostic(diagnostics, {
            code: "zod-preprocess-output-only",
            message:
                `z.preprocess(...) detected at ${formatPointer(pointer)}. ` +
                "Zod silently renders the OUTPUT-side schema; the preprocess " +
                "function and its input shape are invisible to the rendered " +
                "schema. If you need the input shape, restructure the schema " +
                "to declare it directly.",
            pointer,
            detail: { zodType: "preprocess" },
        });
    }

    // Descend into user-supplied sub-schemas. We avoid `Object.keys`
    // here because Zod's def shapes vary widely (object → `shape`,
    // tuple → `items`, union → `options`, pipe → `in`/`out`, etc.) and
    // an over-broad walk would pull in non-schema members. Instead we
    // recursively visit every value reachable through `def` whose own
    // shape is itself a Zod schema.
    screenPreConversionDescend(
        def,
        pointer,
        depth + 1,
        visited,
        diagnostics,
        recordRejection
    );
}

/**
 * Descend into the values of a Zod `def` object, visiting every nested
 * Zod schema. `def` shapes are heterogeneous, so we walk recursively
 * through plain objects and arrays until we find a value with a
 * `_zod.def` marker — those nodes are the user-supplied sub-schemas.
 *
 * Pointer accumulation:
 *
 * - For `def.shape.<key>` we emit pointers of the form
 *   `/properties/<key>`, matching the JSON Schema rendering of an
 *   object's properties so diagnostics line up with what consumers see
 *   in the rendered output.
 * - For `def.items[<i>]` we emit `/items/<i>`.
 * - For `def.options[<i>]` we emit `/anyOf/<i>` so union members line
 *   up with their JSON Schema position.
 * - For pipe `def.in` / `def.out` we emit `/in` / `/out`.
 * - Everything else descends without extending the pointer (the
 *   diagnostic stays anchored at the parent location).
 *
 * The pointer scheme is deliberately conservative — it errs on the
 * side of "parent-anchored" when the JSON Schema name for a Zod field
 * is ambiguous, rather than fabricating a synthetic location.
 */
function screenPreConversionDescend(
    def: Record<string, unknown>,
    parentPointer: string,
    depth: number,
    visited: Set<object>,
    diagnostics: DiagnosticsOptions | undefined,
    recordRejection: (err: SchemaNormalisationError) => void
): void {
    if (depth >= MAX_REF_DEPTH) return;

    // Object schemas store properties under `shape`. Pointer segments
    // are appended one-at-a-time because {@link appendPointer} encodes
    // `/` inside a segment as `~1` per RFC 6901 — a single
    // `appendPointer(p, "properties/x")` call would emit `~1` between
    // "properties" and "x" instead of the desired `/`.
    const shape = getProperty(def, "shape");
    if (isObject(shape)) {
        const shapeBase = appendPointer(parentPointer, "properties");
        for (const [key, value] of Object.entries(shape)) {
            screenPreConversionWalk(
                value,
                appendPointer(shapeBase, key),
                depth + 1,
                false,
                visited,
                diagnostics,
                recordRejection
            );
        }
    }

    // Tuple / array element schemas.
    const items = getProperty(def, "items");
    if (Array.isArray(items)) {
        const itemsBase = appendPointer(parentPointer, "items");
        items.forEach((item, index) => {
            screenPreConversionWalk(
                item,
                appendPointer(itemsBase, String(index)),
                depth + 1,
                false,
                visited,
                diagnostics,
                recordRejection
            );
        });
    } else if (isObject(items)) {
        screenPreConversionWalk(
            items,
            appendPointer(parentPointer, "items"),
            depth + 1,
            false,
            visited,
            diagnostics,
            recordRejection
        );
    }

    // Union and discriminated-union members.
    const options = getProperty(def, "options");
    if (Array.isArray(options)) {
        const optionsBase = appendPointer(parentPointer, "anyOf");
        options.forEach((option, index) => {
            screenPreConversionWalk(
                option,
                appendPointer(optionsBase, String(index)),
                depth + 1,
                false,
                visited,
                diagnostics,
                recordRejection
            );
        });
    }

    // Pipe-shaped schemas (codec, preprocess, plain pipe). The input
    // side is the one safeParse consumes; the output side is what
    // toJSONSchema renders. Walk both so nested constructs inside either
    // half are surfaced.
    const inSide = getProperty(def, "in");
    if (isObject(inSide)) {
        screenPreConversionWalk(
            inSide,
            appendPointer(parentPointer, "in"),
            depth + 1,
            false,
            visited,
            diagnostics,
            recordRejection
        );
    }
    const outSide = getProperty(def, "out");
    if (isObject(outSide)) {
        screenPreConversionWalk(
            outSide,
            appendPointer(parentPointer, "out"),
            depth + 1,
            false,
            visited,
            diagnostics,
            recordRejection
        );
    }

    // Unwrap-style schemas (optional, nullable, default, readonly,
    // promise, catch, lazy resolution, etc.) carry their inner type
    // under `innerType` (or `getter` for lazy — handled below).
    const innerType = getProperty(def, "innerType");
    if (isObject(innerType)) {
        screenPreConversionWalk(
            innerType,
            parentPointer,
            depth + 1,
            false,
            visited,
            diagnostics,
            recordRejection
        );
    }

    // Record-shaped schemas: `keyType` / `valueType`.
    const valueType = getProperty(def, "valueType");
    if (isObject(valueType)) {
        screenPreConversionWalk(
            valueType,
            appendPointer(parentPointer, "additionalProperties"),
            depth + 1,
            false,
            visited,
            diagnostics,
            recordRejection
        );
    }

    // Lazy: invoke the getter once to materialise the inner schema.
    // {@link safeCallNoArgs} swallows construction errors — see its
    // JSDoc for the rationale.
    const inner = safeCallNoArgs(getProperty(def, "getter"));
    if (isObject(inner)) {
        screenPreConversionWalk(
            inner,
            parentPointer,
            depth + 1,
            false,
            visited,
            diagnostics,
            recordRejection
        );
    }
}

/**
 * Format an empty pointer as `<root>` so error messages do not contain
 * a stray bare `""`. Non-empty pointers are returned verbatim.
 */
function formatPointer(pointer: string): string {
    return pointer === "" ? "<root>" : pointer;
}

/**
 * True when a Zod node's `_zod.traits` set contains the named marker.
 * Returns false when traits is absent or not a Set — Zod always
 * populates it on real schemas, so the missing-Set case is treated as
 * "marker not present".
 */
function hasTrait(zod: Record<string, unknown>, traitName: string): boolean {
    const traits = zod.traits;
    if (traits instanceof Set) return traits.has(traitName);
    return false;
}

/**
 * True when `value` is a Zod schema implemented as a codec
 * (`z.codec(...)`). Detection looks for the `$ZodCodec` marker on the
 * schema's `_zod.traits` Set — the same structural check used by Zod
 * itself in `to-json-schema.ts`'s `isTransforming` helper.
 *
 * Promoted from a duplicated local helper in `react/SchemaComponent.tsx`
 * so the validation boundary inside `runValidation` can branch on
 * codec-vs-not-codec without re-implementing the trait check. The
 * shared helper anchors a single source of truth for codec detection:
 * any future change to Zod's trait naming flows through here, not
 * through two parallel copies.
 *
 * Returns `false` for non-objects, plain JSON Schema inputs, OpenAPI
 * documents, or Zod schemas of any other kind. This is structural
 * rather than nominal — a Zod 4 codec produced by any path that ends
 * up tagging `_zod.traits` with `$ZodCodec` is recognised, including
 * schemas wrapped by user-defined helpers.
 */
export function isCodecSchema(value: unknown): boolean {
    const zod = getProperty(value, "_zod");
    if (!isObject(zod)) return false;
    return hasTrait(zod, "$ZodCodec");
}

/**
 * Type guard narrowing `unknown` to a zero-argument function returning
 * `unknown`. The narrowing is genuinely structural: `typeof === "function"`
 * at runtime is exactly the membership test we want, and Zod has no
 * way to make a getter "have the wrong arity" without breaking its own
 * lazy implementation. Surfacing the narrowing through a guard means
 * the call site can invoke `fn()` without an `as` assertion and the
 * boundary lives in one named, documented location.
 */
function isNoArgFunction(value: unknown): value is () => unknown {
    return typeof value === "function";
}

/**
 * Invoke a value as a zero-argument function safely, returning whatever
 * the function returns or `undefined` if it throws or is not callable.
 * Centralises the lazy-schema getter invocation that both
 * {@link containsNestedZod3Inner} and {@link screenPreConversionDescend}
 * need; the throw is swallowed because the absence of a materialisable
 * inner is not a screening concern — downstream `z.toJSONSchema` will
 * surface any genuine construction failure with its own message.
 */
function safeCallNoArgs(candidate: unknown): unknown {
    if (!isNoArgFunction(candidate)) return undefined;
    try {
        return candidate();
    } catch {
        return undefined;
    }
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
 * Verbatim sources (kept aligned with `tests/zod-error-wording-contract.unit.test.ts`).
 * Source files are referenced by message-content anchors rather than line
 * numbers — line numbers drift across Zod patch releases but the message
 * strings themselves are stable and protected by the contract test suite:
 *
 * - `zod/src/v4/core/json-schema-processors.ts` — emits `BigInt cannot be
 *   represented`, `Symbols cannot be represented`, `Undefined cannot be
 *   represented`, `Void cannot be represented`, `Date cannot be
 *   represented`, `Literal \`undefined\` cannot be represented`,
 *   `BigInt literals cannot be represented`, `NaN cannot be represented`,
 *   `Custom types cannot be represented`, `Function types cannot be
 *   represented`, `Transforms cannot be represented`, `Map cannot be
 *   represented`, `Set cannot be represented`, `Dynamic catch values are
 *   not supported`.
 * - `zod/src/v4/core/to-json-schema.ts` — emits `[toJSONSchema]:
 *   Non-representable type encountered: ${def.type}` (the catch-all
 *   fallback), `Unprocessed schema. This is a bug in Zod.` (the
 *   internal-bug branch), `Duplicate schema id "${id}" detected during
 *   JSON Schema conversion.` (the duplicate-id branch), `Cycle detected:
 *   ` (the cycle-throw branch), and `Error converting schema to JSON.`
 *   (the Standard Schema boundary wrapper).
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
            // the zodType field. A missing capture (`undefined`) means Zod
            // has reworded the message in a way the anchored regex cannot
            // express — surface that explicitly via
            // {@link describeUnparsableZodWording} instead of substituting
            // an empty string and silently classifying the type as unknown.
            const trailing = match[1];
            if (trailing === undefined) {
                return describeUnparsableZodWording(
                    "Non-representable type prefix matched but no trailing capture",
                    full,
                    schema,
                    cause
                );
            }
            const trimmed = trailing.trim();
            const firstToken =
                trimmed.length > 0 ? trimmed.split(/\s+/)[0] : undefined;
            const typeName =
                firstToken !== undefined && firstToken.length > 0
                    ? firstToken
                    : undefined;
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
            // Path is the first whitespace-delimited token (the JSON Pointer
            // up to the trailing newline that Zod inserts before the advice).
            // A missing capture or missing first token means the Zod cycle
            // wording has changed and our regex can no longer locate the
            // pointer; surface that as a structured wording-regression
            // failure rather than silently rendering "at " with no path.
            const trailing = match[1];
            if (trailing === undefined) {
                return describeUnparsableZodWording(
                    "Cycle detected prefix matched but no trailing capture",
                    full,
                    schema,
                    cause
                );
            }
            const path = trailing.split(/\s+/)[0];
            if (path === undefined || path.length === 0) {
                return describeUnparsableZodWording(
                    "Cycle detected message contained no pointer token",
                    full,
                    schema,
                    cause
                );
            }
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
            // The id is delimited by the closing double-quote that follows.
            // A missing capture or missing closing quote means the duplicate-id
            // wording has shifted and the id can no longer be located —
            // structured failure rather than silently rendering `""`.
            const trailing = match[1];
            if (trailing === undefined) {
                return describeUnparsableZodWording(
                    "Duplicate schema id prefix matched but no trailing capture",
                    full,
                    schema,
                    cause
                );
            }
            const closing = trailing.indexOf('"');
            if (closing === -1) {
                return describeUnparsableZodWording(
                    "Duplicate schema id message had no closing quote",
                    full,
                    schema,
                    cause
                );
            }
            const id = trailing.slice(0, closing);
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
 * Build a structured `zod-conversion-failed` error for the case where a
 * classifier rule's prefix matched but the trailing capture or follow-on
 * parsing could not extract the expected payload (cycle pointer,
 * duplicate id, non-representable type name, ...).
 *
 * This replaces the previous pattern of substituting an empty string
 * fallback — `match[1] ?? ""` would silently produce error messages like
 * `"Zod detected a cycle in the schema graph at ."` whenever Zod's
 * wording drifted, hiding the regression behind a misleading message.
 * Raising a wording-regression error instead surfaces the drift loudly
 * so the classifier rule (and its contract test) can be repaired.
 */
function describeUnparsableZodWording(
    reason: string,
    fullMessage: string,
    schema: unknown,
    cause: unknown
): SchemaNormalisationError {
    return new SchemaNormalisationError(
        `Zod error matched a classifier prefix but the trailing message ` +
            `could not be parsed (${reason}). This usually means Zod has ` +
            `reworded the error since the classifier was last updated — ` +
            `the matching rule in adapter.ts CLASSIFIER_RULES needs to be ` +
            `revised to track the new wording. Original message: ${fullMessage}`,
        schema,
        "zod-conversion-failed",
        undefined,
        cause
    );
}

/**
 * Maximum recursion depth for {@link containsNestedZod3}. Reuses the
 * shared {@link MAX_REF_DEPTH} so the runtime walk and the compile-time
 * `DEFAULT_MAX_DEPTH` (type-aliased to the same value) stay in lockstep.
 */

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
 * - **Depth cap.** Recursion is bounded by {@link MAX_REF_DEPTH}
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
    if (depth >= MAX_REF_DEPTH) return false;
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
    //
    // Lazy schemas hide the inner schema behind a getter function
    // (`_zod.def = { type: "lazy", getter: () => innerSchema }`). The
    // generic `Object.keys` walk below would never reach through the
    // function, so a Zod 3 schema returned by the getter would slip
    // past the detector. Invoke the getter once here — with a
    // try/catch in case the user code throws on construct — and feed
    // the materialised inner schema through the recursion. Depth is
    // bumped so a self-referential lazy chain still hits the
    // `MAX_REF_DEPTH` cap.
    if (isObject(zod) && isObject(zod.def)) {
        const def4 = zod.def;
        if (def4.type === "lazy") {
            const inner = safeCallNoArgs(def4.getter);
            if (containsNestedZod3Inner(inner, visited, depth + 1)) {
                return true;
            }
        }
        return containsNestedZod3Inner(def4, visited, depth + 1);
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
        case "unsupported-schema-lib": {
            // Surface the vendor name when the input self-identifies via
            // the Standard Schema `~standard.vendor` field. Without this,
            // valibot / arktype / etc. schemas dropped through with a
            // generic message that gave the consumer no clue which
            // library produced the input.
            const vendor = extractStandardSchemaVendor(input);
            const detectedVia =
                vendor !== undefined
                    ? `it self-identifies as the Standard Schema implementation "${vendor}"`
                    : "it exposes `parse` and `safeParse` but carries no Zod 4 " +
                      "(`_zod`) or Zod 3 (`_def`) marker";
            throw new SchemaNormalisationError(
                `Input looks like a schema from a non-Zod library — ${detectedVia}. ` +
                    "schema-components requires a Zod 4 schema. Convert the schema " +
                    "with the equivalent Zod 4 builder, or feed schema-components a " +
                    "JSON Schema / OpenAPI document instead. See the Zod 4 contract " +
                    "at https://zod.dev/v4 or run: pnpm add zod@^4",
                input,
                "unsupported-schema"
            );
        }
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
    // Zod 4 schema and is classified explicitly.
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
    // shape-mismatched schema. Pre-conversion classification surfaces
    // the mismatch loudly. The screen walks the entire tree so nested
    // occurrences (`z.object({ p: z.promise(...) })`) are caught too;
    // see `screenPreConversion` JSDoc for the full taxonomy.
    screenPreConversion(input, diagnostics);

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
        // OpenAPI Schema Object semantics mandate an object schema, so
        // boolean targets (legitimate per JSON Schema Draft 06+) cannot
        // be returned through this path. They surface via the
        // "Unsupported OpenAPI ref format" error below, matching the
        // expectations of the wider OpenAPI parser.
        if (resolved !== undefined && typeof resolved !== "boolean") {
            return resolved;
        }
    }

    throw new Error(`Unsupported OpenAPI ref format: ${ref}`);
}

// ---------------------------------------------------------------------------
// Root meta extraction
// ---------------------------------------------------------------------------

/**
 * Surface root-level metadata from the JSON Schema into the `rootMeta`
 * shape consumed by the walker. Pulls `readOnly`, `writeOnly`,
 * `description`, `title`, `deprecated`, `examples`, and `default`
 * directly from the schema root.
 *
 * `examples` is forwarded only when present as an array (per JSON Schema
 * Draft 2020-12 — Draft 04's `example` singular is normalised upstream).
 * `default` is forwarded for any value the schema declares (any JSON
 * value, including `null` and `false`); the presence check uses `in`
 * so a literal `false` or `null` default is preserved.
 *
 * `examples` and `default` ride on the `[key: string]: unknown` index
 * signature of {@link SchemaMeta}. They are not declared as named fields
 * on `SchemaMeta` because that type lives in `types.ts` and is shared
 * with the walker; the index signature is the agreed extension point.
 */
export function extractRootMetaFromJson(
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
    if (Array.isArray(jsonSchema.examples)) {
        meta.examples = jsonSchema.examples;
    }
    if ("default" in jsonSchema) {
        meta.default = jsonSchema.default;
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
}
