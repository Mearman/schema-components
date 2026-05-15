/**
 * React record renderer tests.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { SchemaComponent } from "../src/react/SchemaComponent.tsx";

const numberRecordSchema = {
    type: "object" as const,
    additionalProperties: { type: "number" as const },
} as const;

describe("React record renderer", () => {
    it("renders record entries instead of falling back to raw JSON", () => {
        const html = renderToString(
            <SchemaComponent
                schema={numberRecordSchema}
                value={{ react: 92, typescript: 88 }}
                readOnly
            />
        );

        expect(html).toContain("react");
        expect(html).toContain("92");
        expect(html).toContain("typescript");
        expect(html).toContain("88");
        expect(html).not.toContain("{&quot;react&quot;:92");
    });

    it("renders editable record values as typed child inputs", () => {
        const html = renderToString(
            <SchemaComponent
                schema={numberRecordSchema}
                value={{ react: 92 }}
            />
        );

        expect(html).toContain("react");
        expect(html).toContain('type="number"');
        expect(html).toContain('value="92"');
    });
});
