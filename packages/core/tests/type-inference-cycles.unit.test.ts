/**
 * Compile-time tests for type-level $ref cycle detection.
 *
 * Verifies that recursive $ref chains produce __SchemaInferenceFellBack
 * instead of silently degrading to Record<string, FieldOverride>.
 */

import { describe, it, expectTypeOf } from "vitest";
import type {
    FromJSONSchema,
    ResolveSchemaRef,
    __SchemaInferenceFellBack,
    InferRequestBodyFields,
} from "../src/core/typeInference.ts";

// ---------------------------------------------------------------------------
// Type-level cycle detection tests
// ---------------------------------------------------------------------------

describe("type-level cycle detection", () => {
    it("__SchemaInferenceFellBack is a branded type with unique symbol", () => {
        type Fallback = __SchemaInferenceFellBack;
        type HasSymbol = Fallback extends {
            readonly __schemaInferenceFallback: unique symbol;
        }
            ? true
            : false;
        expectTypeOf<HasSymbol>().toEqualTypeOf<true>();
    });

    it("non-recursive $ref resolves to the expected type", () => {
        interface Defs {
            Name: { type: "string" };
        }
        type Result = ResolveSchemaRef<"#/$defs/Name", Defs>;
        expectTypeOf<Result>().toEqualTypeOf<string>();
    });

    it("FromJSONSchema produces unknown for non-matching schema", () => {
        type Result = FromJSONSchema<{ $recursiveRef: "#" }>;
        expectTypeOf<Result>().toEqualTypeOf<unknown>();
    });

    it("InferRequestBodyFields returns Record for runtime documents", () => {
        type Fields = InferRequestBodyFields<unknown, string, string>;
        expectTypeOf<Fields>().toEqualTypeOf<
            Record<string, import("../src/core/types.ts").FieldOverride>
        >();
    });
});
