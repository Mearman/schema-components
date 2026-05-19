import { describe, expect, it } from "vitest";
import {
    fieldDomId,
    hintIdFor,
    normaliseIdSegment,
    panelIdFor,
    tabIdFor,
} from "../src/core/idPath.ts";

describe("normaliseIdSegment", () => {
    it("collapses runs of non-id characters to a single hyphen", () => {
        expect(normaliseIdSegment("user.name[0]")).toBe("user-name-0");
    });

    it("strips trailing hyphens left by the collapse pass", () => {
        expect(normaliseIdSegment("tags[0]")).toBe("tags-0");
    });

    it("preserves ASCII letters, digits, underscore and hyphen", () => {
        expect(normaliseIdSegment("user_name-2024")).toBe("user_name-2024");
    });
});

describe("fieldDomId", () => {
    it("prefixes the normalised segment with sc-", () => {
        expect(fieldDomId("user.name")).toBe("sc-user-name");
    });

    it("returns the bare prefix for an empty path", () => {
        // Leaf renderers at the schema root (e.g. `renderToHtml(z.string())`)
        // pass an empty path; the helper must produce a usable id without
        // throwing. Container renderers always thread a non-empty path
        // through `renderChild`, so the empty-id case can never produce
        // sibling collisions inside a structured form.
        expect(fieldDomId("")).toBe("sc-");
    });
});

describe("derived id helpers", () => {
    it("hintIdFor suffixes the field id with -hint", () => {
        expect(hintIdFor("sc-user-name")).toBe("sc-user-name-hint");
    });

    it("panelIdFor and tabIdFor share the same canonical base", () => {
        const path = "user.preferences";
        expect(panelIdFor(path)).toBe("sc-user-preferences-panel");
        expect(tabIdFor(path, 2)).toBe("sc-user-preferences-tab-2");
    });
});

describe("non-ASCII field name disambiguation", () => {
    // The whitelist-based collapse previously turned every non-ASCII run
    // into the same single hyphen, then stripped trailing hyphens, so
    // distinct property names like `名前`, `用户名`, and `🦄` all
    // produced the empty segment and collided on the bare `sc-` prefix.
    // The disambiguator must guarantee uniqueness while keeping the
    // result a valid CSS identifier.

    const cssIdPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;

    it("produces unique ids for inputs that collapse to the same prefix", () => {
        const inputs = ["café", "名前", "用户名", "🦄", "café "];
        const ids = inputs.map((s) => fieldDomId(s));
        const unique = new Set(ids);
        expect(unique.size).toBe(inputs.length);
    });

    it("every generated id matches the CSS identifier pattern", () => {
        const inputs = [
            "café",
            "名前",
            "用户名",
            "🦄",
            "name",
            "user.preferences",
            "tags[0]",
        ];
        for (const input of inputs) {
            expect(fieldDomId(input)).toMatch(cssIdPattern);
        }
    });

    it("normalisation is deterministic across calls", () => {
        for (const input of ["café", "名前", "用户名", "🦄"]) {
            expect(normaliseIdSegment(input)).toBe(normaliseIdSegment(input));
            expect(fieldDomId(input)).toBe(fieldDomId(input));
        }
    });

    it("preserves the readable prefix when characters are dropped", () => {
        // `café` collapses to `caf` under the whitelist, but the
        // disambiguator should still expose the readable prefix —
        // appending a hash, not replacing the whole segment.
        const id = fieldDomId("café");
        expect(id.startsWith("sc-caf-")).toBe(true);
    });

    it("distinguishes inputs whose visible characters survive the collapse identically", () => {
        // `café` and `cafè` both whitelist down to `caf`, but they are
        // distinct property names and so must produce distinct ids.
        expect(fieldDomId("café")).not.toBe(fieldDomId("cafè"));
    });
});
