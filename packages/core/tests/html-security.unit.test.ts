/**
 * HTML renderer security tests — XSS surface coverage for the sync renderer.
 *
 * Schema-author content (`meta.description`, custom titles, etc.) reaches
 * the renderer as `unknown`. Where it is interpolated into markup it must
 * be routed through `h()` + `serialize` so HTML special characters become
 * entities. Any place that builds raw markup with string templates is a
 * latent injection point.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { renderToHtml } from "../src/html/renderToHtml.ts";

describe("renderToHtml — recursion-depth sentinel escapes labels", () => {
    it("escapes <script> in meta.description when the depth cap fires", () => {
        // Build a recursive Zod schema where the recursive element carries
        // an attacker-controlled description. Once we descend past the
        // depth cap, the renderer falls back to the sentinel — which must
        // escape the label rather than interpolating it raw.
        const xssDescription = '<script>alert("xss")</script>';
        const treeSchema: z.ZodType = z.object({
            label: z.string(),
            children: z
                .array(z.lazy(() => treeSchema))
                .optional()
                .meta({ description: xssDescription }),
        });

        // Make the value deep enough to blow past the cap (10).
        function makeDeep(depth: number): {
            label: string;
            children: ReturnType<typeof makeDeep>[];
        } {
            if (depth === 0) return { label: "leaf", children: [] };
            return {
                label: `n-${String(depth)}`,
                children: [makeDeep(depth - 1)],
            };
        }
        const value = makeDeep(15);

        const html = renderToHtml(treeSchema, { value, readOnly: true });

        // The sentinel must fire.
        expect(html).toContain("(recursive)");
        // The raw payload must NOT appear verbatim.
        expect(html).not.toContain("<script>alert");
        // Escaped form should be present so we know the label was routed
        // through the serialiser.
        expect(html).toContain("&lt;script&gt;");
    });
});
