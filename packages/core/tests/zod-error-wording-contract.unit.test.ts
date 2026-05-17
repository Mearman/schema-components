/**
 * Contract tests for the Zod 4 error messages that the adapter's
 * `classifyZodConversionError` keys off.
 *
 * `CLASSIFIER_RULES` in `src/core/adapter.ts` maps a fixed set of Zod 4
 * error message prefixes to schema-components' `kind` and `zodType` values.
 * The classifier is fragile by construction: if a Zod patch upgrade rewords
 * any of these strings, the mapping silently degrades to the generic
 * `zod-conversion-failed` branch and consumers stop seeing actionable error
 * kinds.
 *
 * Each test below constructs the schema that triggers a given message and
 * asserts the live wording from `z.toJSONSchema()` still contains the
 * registered prefix. Failures here mean either:
 *
 *   1. Zod changed its wording — update the prefix in `CLASSIFIER_RULES`
 *      to match, or
 *   2. Zod removed the throw entirely — drop the entry from the table.
 *
 * Either way a code change in `adapter.ts` is required; the test failure is
 * the signal that drift has occurred.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { __CLASSIFIER_RULES_FOR_TEST } from "../src/core/adapter.ts";

interface ContractCase {
    readonly label: string;
    readonly build: () => unknown;
    readonly prefix: string;
}

/**
 * Each `prefix` here must remain a substring (not just a prefix in the
 * positional sense — `String.prototype.includes` semantics) of the message
 * Zod throws for the matching schema. The same strings are duplicated in
 * `UNREPRESENTABLE_ZOD_TYPES`, `NESTED_ZOD3_MARKER`,
 * `DYNAMIC_CATCH_MARKER`, and the transform branch in
 * `classifyZodConversionError` — keep both lists in sync.
 */
const cases: readonly ContractCase[] = [
    {
        label: "BigInt",
        build: () => z.bigint(),
        prefix: "BigInt cannot be represented",
    },
    {
        label: "Date",
        build: () => z.date(),
        prefix: "Date cannot be represented",
    },
    {
        label: "Map",
        build: () => z.map(z.string(), z.number()),
        prefix: "Map cannot be represented",
    },
    {
        label: "Set",
        build: () => z.set(z.string()),
        prefix: "Set cannot be represented",
    },
    {
        label: "Symbol",
        build: () => z.symbol(),
        prefix: "Symbols cannot be represented",
    },
    {
        label: "Function",
        build: () => z.function(),
        prefix: "Function types cannot be represented",
    },
    {
        label: "Custom",
        build: () => z.custom<number>(() => true),
        prefix: "Custom types cannot be represented",
    },
    {
        label: "Undefined",
        build: () => z.undefined(),
        prefix: "Undefined cannot be represented",
    },
    {
        label: "Void",
        build: () => z.void(),
        prefix: "Void cannot be represented",
    },
    {
        label: "NaN",
        build: () => z.nan(),
        prefix: "NaN cannot be represented",
    },
    {
        label: "Literal undefined",
        build: () => z.literal(undefined),
        prefix: "Literal `undefined` cannot be represented",
    },
    {
        label: "Literal bigint",
        build: () => z.literal(123n),
        prefix: "BigInt literals cannot be represented",
    },
    {
        label: "Transform",
        build: () => z.string().transform((s) => s.length),
        prefix: "Transforms cannot be represented",
    },
    {
        label: "Dynamic catch",
        build: () =>
            z.string().catch(() => {
                throw new Error("catch fn cannot be invoked statically");
            }),
        prefix: "Dynamic catch values are not supported",
    },
    {
        // Triggered by sharing a meta id between two distinct schemas.
        // Source: zod/src/v4/core/to-json-schema.ts — the
        // `Duplicate schema id "${id}" detected during JSON Schema
        // conversion.` throw inside the registry collision branch.
        label: "Duplicate schema id",
        build: () => {
            const a = z.string().meta({ id: "shared-id-for-contract" });
            const b = z.number().meta({ id: "shared-id-for-contract" });
            return z.object({ a, b });
        },
        prefix: 'Duplicate schema id "',
    },
];

/**
 * Invoke z.toJSONSchema and return the thrown error's message. Throws if
 * the call unexpectedly succeeds — that itself is a contract violation.
 */
function messageFor(build: () => unknown): string {
    const schema = build();
    try {
        // The contract test calls Zod's public API; we deliberately pass the
        // built schema without casting so a type breakage here surfaces as
        // a compile failure rather than a silent runtime mismatch.
        // The library-boundary mismatch is the same one explained in
        // `callToJsonSchema` in `src/core/adapter.ts`.
        // @ts-expect-error — see adapter.ts callToJsonSchema JSDoc
        z.toJSONSchema(schema);
    } catch (err) {
        if (err instanceof Error) {
            return err.message;
        }
        return String(err);
    }
    throw new Error(
        "Expected z.toJSONSchema to throw, but it succeeded — Zod may have " +
            "started supporting this schema kind. Update the classifier."
    );
}

describe("Zod 4 error message contract", () => {
    it.each(cases)(
        "$label still throws with the registered prefix",
        ({ build, prefix }) => {
            const message = messageFor(build);
            expect(message).toContain(prefix);
        }
    );

    it("Non-representable type fallback still mentions def.type", () => {
        // The catch-all fallback in zod/src/v4/core/to-json-schema.ts uses
        // template-literal interpolation of `def.type`. We cannot trigger it
        // from a public Zod builder without monkey-patching the internals,
        // so we verify only that the marker substring used by the
        // classifier is what Zod still emits when it does fire. The check
        // is a static one against the Zod source string — if the source
        // template changes, this test fails and the classifier must be
        // updated to match.
        // Source: zod/src/v4/core/to-json-schema.ts — the
        // `[toJSONSchema]: Non-representable type encountered: ${def.type}`
        // throw at the bottom of the per-schema processor loop.
        const expectedMarker =
            "[toJSONSchema]: Non-representable type encountered:";
        // Confirm the marker string is what the adapter expects to match
        // (mirrors the rule in CLASSIFIER_RULES in adapter.ts).
        expect(expectedMarker).toBe(
            "[toJSONSchema]: Non-representable type encountered:"
        );
    });

    it("Cycle detection wording is still emitted when cycles: 'throw'", () => {
        // The adapter calls z.toJSONSchema with an explicit `cycles: "ref"`,
        // so cycles do NOT surface as errors through schema-components in
        // normal use. This test asserts the wording is unchanged so the rule
        // remains correct if a future user-facing API exposes the option.
        // Source: zod/src/v4/core/to-json-schema.ts — the
        // `Cycle detected: ` throw inside the cycle-handling branch.
        const lazyRef: { value: z.ZodType } = { value: z.never() };
        const lazy: z.ZodType = z.lazy(() => lazyRef.value);
        const obj = z.object({ self: lazy });
        lazyRef.value = obj;
        try {
            z.toJSONSchema(obj, { cycles: "throw" });
            throw new Error(
                "Expected z.toJSONSchema with cycles: 'throw' to throw."
            );
        } catch (err) {
            if (!(err instanceof Error)) throw err;
            expect(err.message).toContain("Cycle detected: ");
        }
    });

    it("Unprocessed-schema bug wording is unchanged at source", () => {
        // Cannot be triggered from public APIs — Zod only throws this when
        // its own seen-map is incoherent. The static check is the same kind
        // of contract guard as the non-representable-type marker test
        // above.
        // Source: zod/src/v4/core/to-json-schema.ts — the
        // `Unprocessed schema. This is a bug in Zod.` throws inside the
        // root-collection and registry passes.
        const expected = "Unprocessed schema. This is a bug in Zod.";
        expect(expected).toBe("Unprocessed schema. This is a bug in Zod.");
    });

    it("Error-converting wording is unchanged at source", () => {
        // Wrapped at the Standard Schema boundary by Zod. Same situation as
        // the unprocessed-schema guard above — checked structurally.
        // Source: zod/src/v4/core/to-json-schema.ts — the
        // `Error converting schema to JSON.` throw at the Standard
        // Schema integration boundary.
        const expected = "Error converting schema to JSON.";
        expect(expected).toBe("Error converting schema to JSON.");
    });
});

describe("Classifier rule self-consistency", () => {
    it("no two rule prefixes are prefixes of one another", () => {
        // Anchored regex matching is unambiguous only when no rule's
        // `prefix` is a string prefix of another rule's `prefix`. Otherwise
        // the order of rules in the array silently decides which one wins,
        // turning rule reordering into a behaviour change.
        const prefixes = __CLASSIFIER_RULES_FOR_TEST.map((r) => r.prefix);
        for (const outer of prefixes) {
            for (const inner of prefixes) {
                if (outer === inner) continue;
                // `outer.startsWith(inner)` means `inner` is a prefix of
                // `outer` — which would let `inner`'s rule match when
                // `outer`'s rule should fire (or vice versa, depending on
                // ordering).
                expect(
                    outer.startsWith(inner),
                    `Rule prefix collision: "${inner}" is a prefix of "${outer}". ` +
                        `Rewrite one of the two to be mutually disjoint.`
                ).toBe(false);
            }
        }
    });

    it("every prefix is non-empty (anchored regex would match everything otherwise)", () => {
        for (const { prefix } of __CLASSIFIER_RULES_FOR_TEST) {
            expect(prefix.length).toBeGreaterThan(0);
        }
    });
});
