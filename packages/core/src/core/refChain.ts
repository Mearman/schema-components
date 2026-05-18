/**
 * Generic single-pass `$ref` chain resolver.
 *
 * Several OpenAPI / JSON Schema code paths follow `$ref` indirection with
 * cycle and depth protection — Path Item refs, Parameter / Response refs,
 * Reference Object → Reference Object chains, etc. Each call site previously
 * hand-rolled the loop; this helper centralises the discipline so cycle
 * detection, depth-cap behaviour, and the lookup boundary are consistent.
 *
 * The helper is intentionally lookup-shape agnostic: it walks `string` refs
 * via a user-supplied `lookup`, recording each ref string in a `Set` to
 * detect cycles, and tracking hop count against `maxHops`. The caller chooses
 * what to do on cycle or depth-cap via `onCycle` / `onDepthExceeded`.
 */

/** Maximum number of `$ref` hops permitted by default. */
export const DEFAULT_REF_CHAIN_MAX_HOPS = 8;

/**
 * Configuration for a single chain resolution.
 *
 * `lookup(ref)` returns the dereferenced node for a given `$ref` string, or
 * `undefined` when the ref cannot be resolved. The chain follows further
 * `$ref` indirection on the returned node until either:
 *
 *  - The node is not a ref wrapper (final value reached) → returns the node.
 *  - The same ref string is encountered twice → calls `onCycle(ref)`.
 *  - The hop count exceeds `maxHops` → calls `onDepthExceeded(ref)`.
 *  - `lookup` returns `undefined` → returns `undefined`.
 *
 * Callers decide whether `onCycle` / `onDepthExceeded` should throw, emit
 * a diagnostic, or return a fallback value.
 */
export interface ResolveRefChainOptions<T> {
    /** Resolve a `$ref` string to its target node, or `undefined`. */
    readonly lookup: (ref: string) => T | undefined;
    /**
     * Extract a `$ref` string from a node, or `undefined` when the node is
     * not a ref wrapper. The default reads `node.$ref` when `node` is an
     * object with a string `$ref` property.
     */
    readonly extractRef?: (node: T) => string | undefined;
    /**
     * Called when a previously-visited `$ref` is encountered. Returns the
     * value the resolver should return in place of further resolution.
     */
    readonly onCycle?: (ref: string) => T | undefined;
    /**
     * Called when `maxHops` is exceeded. Returns the value the resolver
     * should return in place of further resolution.
     */
    readonly onDepthExceeded?: (ref: string) => T | undefined;
    /**
     * Maximum number of `$ref` hops permitted before `onDepthExceeded` fires.
     * Defaults to `DEFAULT_REF_CHAIN_MAX_HOPS`.
     */
    readonly maxHops?: number;
    /**
     * Pre-seeded visited-set. Useful when the caller has already followed
     * one or more hops outside this helper.
     */
    readonly visited?: Set<string>;
}

function defaultExtractRef(node: unknown): string | undefined {
    if (typeof node !== "object" || node === null) return undefined;
    if (!("$ref" in node)) return undefined;
    const { $ref } = node;
    return typeof $ref === "string" ? $ref : undefined;
}

/**
 * Resolve a `$ref` chain starting from `initial`. See `ResolveRefChainOptions`
 * for the contract. Returns the final dereferenced node, the cycle/depth
 * fallback, or `undefined` when a hop cannot be resolved.
 */
export function resolveRefChain<T>(
    initial: T,
    options: ResolveRefChainOptions<T>
): T | undefined {
    const {
        lookup,
        extractRef = defaultExtractRef,
        onCycle,
        onDepthExceeded,
        maxHops = DEFAULT_REF_CHAIN_MAX_HOPS,
        visited = new Set<string>(),
    } = options;

    let current: T | undefined = initial;
    let hops = 0;

    while (current !== undefined) {
        const ref = extractRef(current);
        if (ref === undefined) return current;

        if (visited.has(ref)) {
            return onCycle !== undefined ? onCycle(ref) : undefined;
        }
        visited.add(ref);

        if (hops >= maxHops) {
            return onDepthExceeded !== undefined
                ? onDepthExceeded(ref)
                : undefined;
        }
        hops += 1;

        current = lookup(ref);
    }

    return undefined;
}
