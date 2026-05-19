/**
 * Per-instance id-prefix derivation, parallel to
 * `react/SchemaComponent.tsx`'s {@link sanitisePrefix}.
 *
 * Vue 3.5 introduced `useId()` for stable per-instance ids inside
 * `setup()`. The helper below normalises whatever Vue returns into a
 * DOM-id-safe string (no colons, parens, or other punctuation that
 * breaks CSS selectors) so the result composes with the canonical
 * `sc-` prefix from `core/cssClasses.ts`.
 *
 * Older Vue versions (before 3.5) do not expose `useId()`; the SFCs that
 * consume the helper therefore prefer it when available and fall back
 * to a monotonic counter scoped to the module. Both branches produce
 * deterministic, sanitised prefixes.
 */

import { useId as vueUseId } from "vue";

let fallbackCounter = 0;

/**
 * Sanitise a raw id value into a DOM-id-safe prefix. Mirrors the
 * sanitiser used by the React adapter so prefixes derived from
 * `useId()` survive every CSS selector and `aria-controls` reference.
 */
export function sanitisePrefix(value: string): string {
    const sanitised = value
        .replace(/[^a-zA-Z0-9_]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (sanitised.length === 0) {
        throw new Error(
            `Cannot derive a DOM-safe id prefix from "${value}". Pass an explicit idPrefix prop.`
        );
    }
    return sanitised;
}

/**
 * Append a child path suffix to a parent path. When the suffix is
 * omitted (e.g. transparent wrappers like union options), the parent
 * path is returned unchanged so the child inherits the parent's id.
 *
 * Mirror of `react/SchemaComponent.tsx` `joinPath` — bracketed array
 * indices like `[0]` append directly so `tags` + `[0]` becomes
 * `tags[0]`, matching the canonical form used by `html/a11y.ts` and
 * `core/fieldPath.ts`.
 */
export function joinPath(parent: string, suffix: string | undefined): string {
    if (suffix === undefined || suffix.length === 0) return parent;
    if (parent.length === 0) return suffix;
    if (suffix.startsWith("[")) return `${parent}${suffix}`;
    return `${parent}.${suffix}`;
}

/**
 * Derive the per-instance id prefix used by the Vue SFCs.
 *
 * Prefers Vue 3.5+ `useId()` (which guarantees per-component
 * uniqueness across SSR/CSR hydration). Older Vue runtimes expose
 * `useId` as a function returning `undefined` or omit it entirely
 * — the helper falls back to a monotonic counter scoped to this
 * module so the resulting prefix is still deterministic and
 * collision-free within a single render tree.
 *
 * Must be called from within a `setup()` invocation: Vue's `useId`
 * only resolves inside an active component instance.
 */
export function deriveIdPrefix(explicit: string | undefined): string {
    if (explicit !== undefined) return sanitisePrefix(explicit);
    // Vue's `useId` is typed to always return a string in 3.5+. The
    // runtime check guards older Vue versions where the export may
    // be `undefined`.
    const raw = typeof vueUseId === "function" ? vueUseId() : undefined;
    if (typeof raw === "string" && raw.length > 0) {
        return sanitisePrefix(raw);
    }
    fallbackCounter += 1;
    return `sc-vue-${String(fallbackCounter)}`;
}
