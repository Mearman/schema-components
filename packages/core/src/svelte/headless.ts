/**
 * Svelte 5 headless renderer — the default
 * {@link SvelteComponentResolver} implementation.
 *
 * Produces plain HTML elements (through one `.svelte` component per
 * schema type) for every field variant the walker can emit. Theme
 * adapters override entries by supplying their own resolver to the
 * `<SchemaProvider>` component.
 *
 * The headless resolver wires each entry through
 * {@link makeSvelteRenderer} — which pairs the component constructor
 * with the per-field props the dispatcher computes, returning a
 * {@link SvelteRenderDescriptor} that the parent container renderer
 * mounts via `<Mount descriptor={…} />`.
 *
 * Mirror of `react/headless.tsx` — same schema-type coverage, same
 * accessibility wiring, same fallback policy. Every `WalkedField`
 * variant the walker can emit has a registered renderer here;
 * missing a registration would cause `getRenderFunction` to return
 * `undefined` and the field to render as nothing, so the resolver
 * registration below is the single source of completeness.
 */

import { makeSvelteRenderer } from "./types.ts";
import type { SvelteComponentResolver } from "./types.ts";
import StringSvelte from "./renderers/String.svelte";
import NumberSvelte from "./renderers/Number.svelte";
import BooleanSvelte from "./renderers/Boolean.svelte";
import EnumSvelte from "./renderers/Enum.svelte";
import ObjectSvelte from "./renderers/Object.svelte";
import ArraySvelte from "./renderers/Array.svelte";
import TupleSvelte from "./renderers/Tuple.svelte";
import RecordSvelte from "./renderers/Record.svelte";
import UnionSvelte from "./renderers/Union.svelte";
import DiscriminatedUnionSvelte from "./renderers/DiscriminatedUnion.svelte";
import LiteralSvelte from "./renderers/Literal.svelte";
import NullSvelte from "./renderers/Null.svelte";
import NeverSvelte from "./renderers/Never.svelte";
import ConditionalSvelte from "./renderers/Conditional.svelte";
import NegationSvelte from "./renderers/Negation.svelte";
import FileSvelte from "./renderers/File.svelte";
import UnknownSvelte from "./renderers/Unknown.svelte";

/**
 * Default {@link SvelteComponentResolver} used by `<SchemaComponent>`
 * / `<SchemaView>` when no theme adapter is provided via
 * `<SchemaProvider>`.
 *
 * Each entry pairs a schema type with the Svelte component
 * constructor that should render it. {@link makeSvelteRenderer}
 * wraps the constructor into the
 * `(props) =\> SvelteRenderDescriptor` shape consumed by the
 * dispatcher.
 */
export const headlessSvelteResolver: SvelteComponentResolver = {
    string: makeSvelteRenderer(StringSvelte),
    number: makeSvelteRenderer(NumberSvelte),
    boolean: makeSvelteRenderer(BooleanSvelte),
    null: makeSvelteRenderer(NullSvelte),
    enum: makeSvelteRenderer(EnumSvelte),
    object: makeSvelteRenderer(ObjectSvelte),
    array: makeSvelteRenderer(ArraySvelte),
    tuple: makeSvelteRenderer(TupleSvelte),
    record: makeSvelteRenderer(RecordSvelte),
    union: makeSvelteRenderer(UnionSvelte),
    discriminatedUnion: makeSvelteRenderer(DiscriminatedUnionSvelte),
    conditional: makeSvelteRenderer(ConditionalSvelte),
    negation: makeSvelteRenderer(NegationSvelte),
    literal: makeSvelteRenderer(LiteralSvelte),
    file: makeSvelteRenderer(FileSvelte),
    never: makeSvelteRenderer(NeverSvelte),
    unknown: makeSvelteRenderer(UnknownSvelte),
};
