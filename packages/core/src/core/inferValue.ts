/**
 * Schema-input → value-type inference utilities.
 *
 * Type-only module shared between the React entry points (`<SchemaComponent>`,
 * `<SchemaView>`, `<SchemaField>`) and the HTML entry points
 * (`renderToHtml`, `renderToHtmlChunks`, `renderToHtmlStream`,
 * `renderToHtmlReadable`). Both surfaces need the same generic plumbing to
 * map a Zod schema / JSON Schema / OpenAPI document (+ ref) to the value
 * shape that the renderer accepts and emits.
 *
 * Lives in `core/` so the HTML layer can consume these types without
 * importing from `react/` — the layer-boundary contract forbids
 * `html/` → `react/` edges (the streaming renderer must remain consumable
 * in non-React environments).
 *
 * Pure types — no runtime exports — so importing this module from any
 * layer is free and cannot pull React or DOM code into a bundle.
 */
import type { z } from "zod";
import type { SchemaIoSide } from "./adapter.ts";
import type { FieldOverride, FieldOverrides } from "./types.ts";
import type {
    FromJSONSchema,
    FromJSONSchemaMode,
    IsSwagger2Doc,
    ResolveOpenAPIRef,
    TypeAtPath,
    __SchemaInferenceFellBack,
} from "./typeInference.ts";

/**
 * Recursive mapped type that mirrors a schema's shape for per-field
 * overrides. Dispatches on the schema kind in the same order as
 * {@link InferSchemaValue} so the inferred override map tracks the
 * inferred value shape.
 *
 * Exported so `<SchemaView>` and other consumers can type their
 * `fields` prop against the same machinery `<SchemaComponent>` uses.
 *
 * @group Components
 */
export type InferFields<T, Ref extends string | undefined> =
    IsSwagger2Doc<T> extends true
        ? __SchemaInferenceFellBack
        : T extends z.ZodType
          ? FieldOverrides<z.infer<T>>
          : T extends { openapi: unknown }
            ? Ref extends string
                ? FieldOverrides<
                      ResolveOpenAPIRef<T & Record<string, unknown>, Ref>
                  >
                : Record<string, FieldOverride>
            : T extends object
              ? unknown extends FromJSONSchema<T>
                  ? Record<string, FieldOverride>
                  : FieldOverrides<FromJSONSchema<T>>
              : Record<string, FieldOverride>;

/**
 * Infer the data type carried by the schema input.
 *
 * Mirrors {@link InferFields}'s dispatch order: Zod schema → `z.infer`,
 * OpenAPI doc + ref → `ResolveOpenAPIRef`, plain JSON Schema object →
 * `FromJSONSchema`, everything else → `unknown`. The `Mode` parameter
 * is plumbed through to `FromJSONSchema` / `ResolveOpenAPIRef` so
 * `readOnly` / `writeOnly` keywords participate in the inferred
 * object shape — `"output"` for the rendered value, `"input"` for the
 * `onChange` argument.
 *
 * When the schema's value type cannot be statically determined (e.g.
 * a runtime `Record<string, unknown>` JSON Schema, or an OpenAPI doc
 * without a ref), the result falls back to `unknown` so callers can
 * still supply arbitrary values.
 */
export type InferSchemaValue<
    T,
    Ref extends string | undefined,
    Mode extends FromJSONSchemaMode,
> =
    IsSwagger2Doc<T> extends true
        ? __SchemaInferenceFellBack
        : T extends z.ZodType
          ? Mode extends "input"
              ? z.input<T>
              : z.output<T>
          : T extends { openapi: unknown }
            ? Ref extends string
                ? ResolveOpenAPIRef<T & Record<string, unknown>, Ref, [], Mode>
                : unknown
            : T extends object
              ?
                    | FromJSONSchema<T, Record<string, never>, [], Mode>
                    | (unknown extends FromJSONSchema<T>
                          ? unknown
                          : never) extends infer V
                  ? V
                  : unknown
              : unknown;

/**
 * Narrow an inferred value type to the sub-shape at `P`, or return
 * the original value type when `P` is `undefined` (no path supplied).
 */
type NarrowAtPath<V, P extends string | undefined> = P extends string
    ? TypeAtPath<V, P>
    : V;

/**
 * Public alias mapping a schema input to the rendered value type.
 *
 * Picks the OUTPUT side (server → client) of every transform / pipe /
 * codec. For an `<SchemaComponent io="output">` or `<SchemaView
 * io="output">` (both defaults), this is the inferred shape of
 * `value` and the parameter of `onChange`.
 */
export type InferredOutputValue<
    T,
    Ref extends string | undefined = undefined,
    P extends string | undefined = undefined,
> = NarrowAtPath<InferSchemaValue<T, Ref, "output">, P>;

/**
 * Companion to {@link InferredOutputValue} for `"input"`-mode shapes.
 *
 * Picks the INPUT side (client → server) of every transform / pipe /
 * codec. Surfaces as the inferred shape of `value` / `onChange` when
 * a consumer renders `<SchemaComponent io="input">`. For JSON Schema
 * inputs with `readOnly`/`writeOnly` annotations, the INPUT mode
 * omits properties marked `readOnly: true`.
 */
export type InferredInputValue<
    T,
    Ref extends string | undefined = undefined,
    P extends string | undefined = undefined,
> = NarrowAtPath<InferSchemaValue<T, Ref, "input">, P>;

/**
 * Resolve the schema-driven value type for either I/O direction.
 *
 * Thin convenience over {@link InferredOutputValue} /
 * {@link InferredInputValue} so consumers that decide between the
 * two at the type level (e.g. a generic wrapper component) can pass
 * the chosen direction as a type argument rather than branch on it
 * with conditional types. Falls back to `unknown` when the schema's
 * value type cannot be statically inferred, identical to the
 * underlying helpers.
 */
export type InferredValue<
    T,
    Ref extends string | undefined = undefined,
    P extends string | undefined = undefined,
    Mode extends SchemaIoSide = "output",
> = NarrowAtPath<InferSchemaValue<T, Ref, Mode>, P>;
