/**
 * Layer-boundary contract test.
 *
 * schema-components is organised into five layers under `packages/core/src/`:
 *
 *   core/    — schema model, walker, types, guards, normalisation
 *   react/   — React renderers, contexts, hooks
 *   openapi/ — OpenAPI document parser and renderer entry points
 *   html/    — HTML serialisation and streaming renderers
 *   themes/  — theme adapters (mui, mantine, radix, shadcn)
 *
 * The architectural rule is that `core/` depends on nothing else, and every
 * sibling layer depends only on `core/` (plus, in `themes/`, on `react/`).
 *
 * No cross-sibling imports — `openapi/` must not import from `react/`,
 * `html/`, or `themes/`; `react/` must not import from `openapi/`, `html/`,
 * or `themes/`; and so on. Without this guarantee the published surface
 * pulls heavy React or DOM code into the OpenAPI parser, theme adapters
 * leak into the HTML renderer, and the package ceases to be tree-shakable.
 *
 * This test enumerates the `.ts` / `.tsx` files under each layer and
 * fails fast when any of them imports across the forbidden boundaries.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PACKAGE_ROOT = join(__dirname, "..");
const SRC_ROOT = join(PACKAGE_ROOT, "src");

/**
 * The five top-level layers. Order is not significant — every layer is
 * checked against every disallowed sibling.
 */
const LAYERS = ["core", "react", "openapi", "html", "themes"] as const;
type Layer = (typeof LAYERS)[number];

/**
 * Allowed cross-layer dependencies. A layer's value lists every sibling
 * it is permitted to import from.
 *
 * `core/` is the foundation — every other layer may import from it,
 * but `core/` itself imports from nothing else. Beyond that, `themes/`
 * and the React-rendering subset of `openapi/` legitimately compose
 * React renderers, so they may also depend on `react/`. No other
 * cross-layer edges are permitted — `html/` in particular must stay
 * independent of React, themes, and the OpenAPI parser so the
 * streaming renderers can be consumed in non-React environments.
 */
const ALLOWED_SIBLING_IMPORTS: Record<Layer, ReadonlySet<Layer>> = {
    core: new Set<Layer>(),
    react: new Set<Layer>(["core"]),
    openapi: new Set<Layer>(["core", "react"]),
    html: new Set<Layer>(["core"]),
    themes: new Set<Layer>(["core", "react"]),
};

/**
 * Recursively collect every `.ts` / `.tsx` file beneath `dir`.
 */
function collectFiles(dir: string): string[] {
    const out: string[] = [];
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const full = join(dir, entry);
        const s = statSync(full);
        if (s.isDirectory()) {
            out.push(...collectFiles(full));
            continue;
        }
        if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Match every relative import path appearing in a `from "…"` or
 * `import("…")` clause. Captures the path so the caller can inspect it.
 */
const IMPORT_PATH = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

/**
 * Decide whether `importPath` resolves into the named sibling layer
 * from a source file located in `originLayer`.
 *
 * Only relative imports (`../<layer>/…`, `./…`) can cross layer
 * boundaries — absolute package imports (e.g. `zod`, `react`) are
 * external and irrelevant here.
 */
function importedLayer(
    importPath: string,
    originLayer: Layer
): Layer | undefined {
    if (!importPath.startsWith("..")) return undefined;
    // Strip a single leading `../` — siblings live one directory above.
    const rest = importPath.slice(3);
    for (const layer of LAYERS) {
        if (layer === originLayer) continue;
        if (rest === layer || rest.startsWith(`${layer}/`)) {
            return layer;
        }
    }
    return undefined;
}

describe("layer boundaries", () => {
    for (const layer of LAYERS) {
        it(`${layer}/ does not import from disallowed siblings`, () => {
            const layerDir = join(SRC_ROOT, layer);
            const files = collectFiles(layerDir);
            const allowed = ALLOWED_SIBLING_IMPORTS[layer];
            const violations: string[] = [];

            for (const file of files) {
                const source = readFileSync(file, "utf8");
                for (const match of source.matchAll(IMPORT_PATH)) {
                    const importPath = match[1];
                    if (importPath === undefined) continue;
                    const target = importedLayer(importPath, layer);
                    if (target === undefined) continue;
                    if (allowed.has(target)) continue;
                    violations.push(
                        `${relative(PACKAGE_ROOT, file)} imports ` +
                            `"${importPath}" — ${layer}/ may not depend on ${target}/.`
                    );
                }
            }

            // Embed the violations directly in the assertion message so a
            // failure surfaces every offending file at once.
            expect(
                violations,
                violations.length > 0
                    ? `Layer-boundary violations in ${layer}/:\n  ${violations.join("\n  ")}`
                    : "no violations"
            ).toEqual([]);
        });
    }
});
