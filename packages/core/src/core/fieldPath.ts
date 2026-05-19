/**
 * Path resolution and value manipulation utilities.
 *
 * Framework-free helpers used by the schema renderers (React's
 * `SchemaComponent`/`SchemaField`, plus future Vue / Solid / Svelte /
 * Lit adapters) to navigate the `WalkedField` tree and the
 * corresponding data value/object by dot-separated paths, including
 * array index notation (`field[0]`).
 */

import type { WalkedField } from "./types.ts";
import { isObject } from "./guards.ts";
import { isPrototypePollutingKey } from "./uri.ts";

// ---------------------------------------------------------------------------
// Tree path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-separated path through a WalkedField tree.
 * Supports array index notation: `field[0]`.
 */
export function resolvePath(
    tree: WalkedField,
    path: string
): WalkedField | undefined {
    if (path.length === 0) return tree;

    const parts = path.split(".");
    let current: WalkedField | undefined = tree;

    for (const part of parts) {
        if (current === undefined) return undefined;

        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        if (bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined) {
            const arrayField = bracketMatch[1];
            if (current.type === "object") {
                current = current.fields[arrayField];
            }
            if (current?.type === "array") {
                current = current.element;
            }
            continue;
        }

        if (current.type === "object") {
            current = current.fields[part];
        } else if (current.type === "array") {
            current = current.element;
        } else {
            return undefined;
        }
    }

    return current;
}

// ---------------------------------------------------------------------------
// Value path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-separated path through a data value.
 * Supports array index notation: `field[0]`.
 *
 * Path segments naming a prototype-polluting property (`__proto__`,
 * `constructor`, `prototype`) refuse to resolve and return `undefined`.
 * Without the refusal, an attacker-supplied path would read
 * `Object.prototype` (or similar) and surface fields injected into the
 * runtime prototype chain as if they belonged to the user's data.
 */
export function resolveValue(root: unknown, path: string): unknown {
    if (path.length === 0) return root;

    const parts = path.split(".");
    let current: unknown = root;

    for (const part of parts) {
        if (!isObject(current)) return undefined;

        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        if (bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined) {
            const key = bracketMatch[1];
            if (isPrototypePollutingKey(key)) return undefined;
            const index = Number(bracketMatch[2]);
            const arr = current[key];
            if (Array.isArray(arr)) {
                current = arr[index];
            } else {
                return undefined;
            }
        } else {
            if (isPrototypePollutingKey(part)) return undefined;
            current = current[part];
        }
    }

    return current;
}

// ---------------------------------------------------------------------------
// Nested value setting
// ---------------------------------------------------------------------------

/**
 * Set a value at a dot-separated path, producing a new root object.
 * Does not mutate the input — returns a shallow-updated copy at each level.
 *
 * Refuses paths whose segments name a prototype-polluting property
 * (`__proto__`, `constructor`, `prototype`). Such a path could otherwise
 * mutate `Object.prototype` (or similar) through the assignment, planting
 * fields visible to every plain object in the runtime. The input `root`
 * is returned unchanged so the caller's onChange handler treats the
 * write as a no-op rather than propagating a poisoned state. This
 * matches the silent-refusal semantics of `dereference` in `core/ref.ts`
 * when a JSON Pointer segment names a prototype-polluting key.
 */
export function setNestedValue(
    root: unknown,
    path: string,
    leafValue: unknown
): unknown {
    if (path.length === 0) return leafValue;

    const parts = path.split(".");
    for (const part of parts) {
        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        const key =
            bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined
                ? bracketMatch[1]
                : part;
        if (isPrototypePollutingKey(key)) return root;
    }

    const result = isObject(root) ? { ...root } : {};

    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === undefined) break;
        const isLast = i === parts.length - 1;

        const bracketMatch = /^(.+)\[(\d+)\]$/.exec(part);
        if (bracketMatch?.[1] !== undefined && bracketMatch[2] !== undefined) {
            const key = bracketMatch[1];
            const index = Number(bracketMatch[2]);
            const existing: unknown = current[key];
            const arr: unknown[] = Array.isArray(existing)
                ? existing.slice()
                : [];
            if (isLast) {
                arr[index] = leafValue;
            }
            current[key] = arr;
            const nextCurrent = arr[index];
            if (nextCurrent !== undefined && isObject(nextCurrent)) {
                current = nextCurrent;
            }
        } else if (isLast) {
            current[part] = leafValue;
        } else {
            const existing: unknown = current[part];
            const next = isObject(existing) ? { ...existing } : {};
            current[part] = next;
            current = next;
        }
    }

    return result;
}
