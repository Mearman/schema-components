/**
 * Shared depth caps and hop counts used to bound recursion across
 * schema-components. All numeric limits live here so the renderer, the
 * ref resolver, the OpenAPI parser, and the type-level inference engine
 * agree on the same constants.
 */

/**
 * Maximum recursion depth for the schema walker, the React renderers,
 * the streaming HTML renderer, and the server-side renderer. Beyond
 * this depth a recursion sentinel is emitted instead of further descent
 * — the only safe response to a cyclic walked-field graph.
 */
export const MAX_RENDER_DEPTH = 10;

/**
 * Maximum depth for `$ref` resolution and Zod-tree walks. Mirrors the
 * type-level `DEFAULT_MAX_DEPTH` ({@link MaxRefDepth}) so the runtime
 * and compile-time bounds agree.
 */
export type MaxRefDepth = 64;
/** Runtime constant matching the type-level {@link MaxRefDepth} bound. */
export const MAX_REF_DEPTH: MaxRefDepth = 64;

/**
 * Maximum number of `$ref` hops permitted when walking a chain of
 * OpenAPI Path Item Object references. Beyond this a
 * `path-item-ref-too-deep` diagnostic is emitted and resolution stops.
 */
export const MAX_PATH_ITEM_REF_HOPS = 8;
