/**
 * Tests for JSON Schema draft and OpenAPI version detection.
 */
import { describe, it, expect } from "vitest";
import {
    detectJsonSchemaDraft,
    detectOpenApiVersion,
    isOpenApi30,
    isOpenApi31,
    isSwagger2,
} from "../src/core/version.ts";

// ---------------------------------------------------------------------------
// detectJsonSchemaDraft
// ---------------------------------------------------------------------------

describe("detectJsonSchemaDraft", () => {
    it("detects Draft 2020-12", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft/2020-12/schema",
            })
        ).toBe("draft-2020-12");
    });

    it("detects Draft 2019-09", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft/2019-09/schema",
            })
        ).toBe("draft-2019-09");
    });

    it("detects Draft 07", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "http://json-schema.org/draft-07/schema#",
            })
        ).toBe("draft-07");
    });

    it("detects Draft 07 with https", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "https://json-schema.org/draft-07/schema#",
            })
        ).toBe("draft-07");
    });

    it("detects Draft 06", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "http://json-schema.org/draft-06/schema#",
            })
        ).toBe("draft-06");
    });

    it("detects Draft 04", () => {
        expect(
            detectJsonSchemaDraft({
                $schema: "http://json-schema.org/draft-04/schema#",
            })
        ).toBe("draft-04");
    });

    it("defaults to draft-2020-12 when $schema is absent", () => {
        expect(detectJsonSchemaDraft({ type: "string" })).toBe("draft-2020-12");
    });

    it("defaults to draft-2020-12 when $schema is not a string", () => {
        expect(detectJsonSchemaDraft({ $schema: 42 })).toBe("draft-2020-12");
    });

    it("defaults to draft-2020-12 for unknown $schema URIs", () => {
        expect(
            detectJsonSchemaDraft({ $schema: "http://example.com/unknown" })
        ).toBe("draft-2020-12");
    });
});

// ---------------------------------------------------------------------------
// detectOpenApiVersion
// ---------------------------------------------------------------------------

describe("detectOpenApiVersion", () => {
    it("detects OpenAPI 3.1.0", () => {
        const version = detectOpenApiVersion({ openapi: "3.1.0" });
        expect(version).toStrictEqual({ major: 3, minor: 1, patch: 0 });
    });

    it("detects OpenAPI 3.0.3", () => {
        const version = detectOpenApiVersion({ openapi: "3.0.3" });
        expect(version).toStrictEqual({ major: 3, minor: 0, patch: 3 });
    });

    it("detects OpenAPI 3.0.0", () => {
        const version = detectOpenApiVersion({ openapi: "3.0.0" });
        expect(version).toStrictEqual({ major: 3, minor: 0, patch: 0 });
    });

    it("detects Swagger 2.0", () => {
        const version = detectOpenApiVersion({ swagger: "2.0" });
        expect(version).toStrictEqual({ major: 2, minor: 0, patch: 0 });
    });

    it("returns undefined for plain JSON Schema", () => {
        expect(detectOpenApiVersion({ type: "object" })).toBe(undefined);
    });

    it("returns undefined for empty object", () => {
        expect(detectOpenApiVersion({})).toBe(undefined);
    });
});

// ---------------------------------------------------------------------------
// Version type guards
// ---------------------------------------------------------------------------

describe("version type guards", () => {
    it("isOpenApi30 identifies 3.0.x", () => {
        expect(isOpenApi30({ major: 3, minor: 0, patch: 3 })).toBe(true);
        expect(isOpenApi30({ major: 3, minor: 0, patch: 0 })).toBe(true);
        expect(isOpenApi30({ major: 3, minor: 1, patch: 0 })).toBe(false);
        expect(isOpenApi30({ major: 2, minor: 0, patch: 0 })).toBe(false);
    });

    it("isOpenApi31 identifies 3.1.x", () => {
        expect(isOpenApi31({ major: 3, minor: 1, patch: 0 })).toBe(true);
        expect(isOpenApi31({ major: 3, minor: 0, patch: 3 })).toBe(false);
    });

    it("isSwagger2 identifies 2.0", () => {
        expect(isSwagger2({ major: 2, minor: 0, patch: 0 })).toBe(true);
        expect(isSwagger2({ major: 3, minor: 0, patch: 0 })).toBe(false);
    });
});
