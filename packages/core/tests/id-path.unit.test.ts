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

    it("throws on empty input rather than collapsing to a shared root id", () => {
        expect(() => fieldDomId("")).toThrow(/non-empty path/);
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
