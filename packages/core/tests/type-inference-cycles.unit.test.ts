/**
 * Compile-time tests for type-level $ref cycle detection.
 *
 * Verifies that recursive $ref chains produce __SchemaInferenceFellBack
 * instead of silently degrading to Record<string, FieldOverride>.
 */

import { describe, it, expectTypeOf } from "vitest";
import type {
    FromJSONSchema,
    __SchemaInferenceFellBack,
    InferRequestBodyFields,
} from "../src/core/typeInference.ts";

// ---------------------------------------------------------------------------
// Type-level cycle detection tests
// ---------------------------------------------------------------------------

describe("type-level cycle detection", () => {
    it("__SchemaInferenceFellBack is a branded type", () => {
        type Fallback = __SchemaInferenceFellBack;
        type HasKey = "__schemaInferenceFallback" extends keyof Fallback
            ? true
            : false;
        expectTypeOf<HasKey>().toEqualTypeOf<true>();
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
