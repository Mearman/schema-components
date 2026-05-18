/**
 * Generates the API inventory section in README.md from the TypeDoc JSON
 * project model.
 *
 * - Reads `typedoc-static/project.json` (produced by `pnpm typedoc`)
 * - Walks every module's top-level documented exports
 * - Emits a grouped markdown table — one section per sub-path (`core/*`,
 *   `react/*`, `openapi/*`, `html/*`, `themes/*`)
 * - Each row links to the symbol's page on the hosted TypeDoc site so
 *   the README is a discovery surface and the HTML site is the deep
 *   reference
 * - Replaces content between `<!-- @generated:api-inventory:start -->`
 *   and `<!-- @generated:api-inventory:end -->` markers in README.md
 *
 * The reflection-kind numbers come from TypeDoc's ReflectionKind enum.
 * Re-exports (kind 4194304) point at the same symbol as the original
 * export so we de-duplicate by name+module.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectJsonPath = resolve(here, "../typedoc-static/project.json");
const readmePath = resolve(here, "../../../README.md");
const storiesDir = resolve(here, "../../docs/stories");
const hostedBase = "https://mearman.github.io/schema-components";
const storybookBase = `${hostedBase}/storybook/`;

const KIND = {
    Variable: 32,
    Function: 64,
    Class: 128,
    Interface: 256,
    TypeAlias: 2097152,
    Reference: 4194304,
    Enum: 8,
};

const KIND_LABEL = {
    [KIND.Variable]: "Variable",
    [KIND.Function]: "Function",
    [KIND.Class]: "Class",
    [KIND.Interface]: "Interface",
    [KIND.TypeAlias]: "Type",
    [KIND.Reference]: "Re-export",
    [KIND.Enum]: "Enum",
};

const KIND_URL_SEGMENT = {
    [KIND.Variable]: "variables",
    [KIND.Function]: "functions",
    [KIND.Class]: "classes",
    [KIND.Interface]: "interfaces",
    [KIND.TypeAlias]: "types",
    [KIND.Enum]: "enums",
};

const SUBPATH_ORDER = ["core", "react", "openapi", "html", "themes"];

const SUBPATH_LABEL = {
    core: "core/*",
    react: "react/*",
    openapi: "openapi/*",
    html: "html/*",
    themes: "themes/*",
};

/**
 * Mirror Storybook's CSF title-to-id sanitiser. The deployed Storybook
 * builds story URLs as `?path=/docs/<sanitised-title>--<sanitised-name>`,
 * so to link out from the inventory we transform the title the same way
 * — lowercase, collapse non-alphanumeric runs to hyphens, trim
 * leading/trailing hyphens — and assume the docs page (`--docs`).
 */
function sanitiseStorybookId(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Reads packages/docs/stories/*.stories.tsx and builds a map from each
 * exported symbol name to the stories that demonstrate it, declared
 * via `parameters: { apiSymbols: ["SymbolName", ...] }` on the story's
 * meta object. Stories without apiSymbols are ignored.
 *
 * Uses regex extraction rather than full TS parsing because the story
 * meta shape is consistent across the codebase and the parser runs in
 * the pre-commit hook where startup cost matters. If the meta shape
 * ever diverges, switch to TypeScript's compiler API.
 */
function loadStoryIndex() {
    const bySymbol = new Map();
    let storyFiles;
    try {
        storyFiles = readdirSync(storiesDir).filter((name) =>
            name.endsWith(".stories.tsx"),
        );
    } catch {
        return bySymbol;
    }

    for (const fileName of storyFiles) {
        const source = readFileSync(join(storiesDir, fileName), "utf8");
        const titleMatch = source.match(/^\s*title:\s*"([^"]+)"/m);
        if (!titleMatch) continue;
        const apiSymbolsMatch = source.match(
            /apiSymbols\s*:\s*\[([^\]]*)\]/m,
        );
        if (!apiSymbolsMatch) continue;
        const title = titleMatch[1];
        const symbols = apiSymbolsMatch[1]
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        const id = sanitiseStorybookId(title);
        const url = `${storybookBase}?path=/docs/${id}--docs`;
        for (const sym of symbols) {
            if (!bySymbol.has(sym)) bySymbol.set(sym, []);
            bySymbol.get(sym).push({ title, url });
        }
    }
    return bySymbol;
}

function renderStoriesCell(stories) {
    if (!stories || stories.length === 0) return "";
    return stories
        .map(({ title, url }) => `[${title}](${url})`)
        .join("<br>");
}

/**
 * Build an `id → reflection` lookup across every nested child in the
 * TypeDoc project tree. Used by {@link summaryOf} to resolve re-export
 * references (kind 4194304) to their original reflection so the
 * inventory shows the source documentation rather than reporting the
 * re-export as undocumented.
 */
function indexReflections(project) {
    const byId = new Map();
    const visit = (node) => {
        if (node === null || typeof node !== "object") return;
        if (typeof node.id === "number") byId.set(node.id, node);
        const children = node.children;
        if (Array.isArray(children)) {
            for (const child of children) visit(child);
        }
        const signatures = node.signatures;
        if (Array.isArray(signatures)) {
            for (const sig of signatures) visit(sig);
        }
    };
    visit(project);
    return byId;
}

function summaryOf(reflection, byId) {
    // Re-exports (kind 4194304) carry a `target` pointer to the original
    // reflection rather than a comment of their own. Resolve through the
    // index so the inventory shows the source documentation.
    if (reflection.target !== undefined) {
        const target = byId.get(reflection.target);
        if (target !== undefined) {
            return summaryOf(target, byId);
        }
    }
    // For function / method reflections TypeDoc attaches the JSDoc block
    // to the first signature, not the reflection itself. Fall back to the
    // signature comment so functions are not all reported as undocumented.
    const parts =
        reflection.comment?.summary ??
        reflection.signatures?.[0]?.comment?.summary ??
        [];
    const text = parts
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    if (!text) return "";
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
    return firstSentence.replace(/\s+/g, " ").replace(/\|/g, "\\|");
}

function urlFor(reflection, modulePath) {
    const segment = KIND_URL_SEGMENT[reflection.kind];
    if (!segment) return null;
    const moduleSlug = modulePath.replace(/\//g, "_");
    return `${hostedBase}/${segment}/${moduleSlug}.${reflection.name}.html`;
}

function isInternalNamespace(name) {
    return name === "<internal>";
}

function collectExports(project, storyIndex) {
    const bySubpath = new Map();
    for (const subpath of SUBPATH_ORDER) bySubpath.set(subpath, []);
    const byId = indexReflections(project);

    for (const moduleRef of project.children ?? []) {
        const modulePath = moduleRef.name;
        const subpath = modulePath.split("/")[0];
        if (!bySubpath.has(subpath)) continue;

        for (const child of moduleRef.children ?? []) {
            if (isInternalNamespace(child.name)) continue;
            if (child.flags?.isPrivate) continue;
            if (!KIND_LABEL[child.kind]) continue;
            bySubpath.get(subpath).push({
                name: child.name,
                kind: child.kind,
                modulePath,
                summary: summaryOf(child, byId),
                stories: storyIndex.get(child.name) ?? [],
            });
        }
    }
    return bySubpath;
}

function renderTable(exports) {
    if (exports.length === 0) return "_No documented exports._\n";
    const rows = exports
        .slice()
        .sort((a, b) =>
            a.modulePath === b.modulePath
                ? a.name.localeCompare(b.name)
                : a.modulePath.localeCompare(b.modulePath),
        )
        .map((e) => {
            const url = urlFor(e, e.modulePath);
            const nameCell = url ? `[\`${e.name}\`](${url})` : `\`${e.name}\``;
            const kindLabel = KIND_LABEL[e.kind];
            const summary = e.summary || "_undocumented_";
            const stories = renderStoriesCell(e.stories);
            return `| ${nameCell} | \`${e.modulePath}\` | ${kindLabel} | ${summary} | ${stories} |`;
        });
    return [
        "| Symbol | Sub-path | Kind | Summary | Stories |",
        "| --- | --- | --- | --- | --- |",
        ...rows,
        "",
    ].join("\n");
}

function buildInventory(project, storyIndex) {
    const grouped = collectExports(project, storyIndex);
    const sections = [];
    for (const subpath of SUBPATH_ORDER) {
        const exports = grouped.get(subpath);
        if (!exports || exports.length === 0) continue;
        const count = exports.length;
        sections.push(
            `<details>\n<summary><code>${SUBPATH_LABEL[subpath]}</code> — ${count} exports</summary>\n`,
        );
        sections.push(renderTable(exports));
        sections.push(`</details>\n`);
    }
    return sections.join("\n");
}

function injectInventory(readme, inventory) {
    const startMarker = "<!-- @generated:api-inventory:start -->";
    const endMarker = "<!-- @generated:api-inventory:end -->";
    const startIndex = readme.indexOf(startMarker);
    const endIndex = readme.indexOf(endMarker);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error(
            `Markers ${startMarker} / ${endMarker} not found in README.md`,
        );
    }
    const before = readme.slice(0, startIndex + startMarker.length);
    const after = readme.slice(endIndex);
    return `${before}\n${inventory}\n${after}`;
}

const project = JSON.parse(readFileSync(projectJsonPath, "utf8"));
const readme = readFileSync(readmePath, "utf8");
const storyIndex = loadStoryIndex();
const inventory = buildInventory(project, storyIndex);
const updated = injectInventory(readme, inventory);
writeFileSync(readmePath, updated, "utf8");
