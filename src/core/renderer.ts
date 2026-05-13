/**
 * Headless default renderer.
 *
 * Produces descriptor objects describing what to render.
 * Theme adapters replace these with actual components.
 */

import type { ComponentResolver, RenderContext, WalkedField } from "./types.ts";

function renderString(ctx: RenderContext): unknown {
    if (ctx.editability === "presentation") {
        return { tag: "span", props: {}, children: [] };
    }

    return {
        tag: "input",
        props: {
            type:
                ctx.constraints.format === "email"
                    ? "email"
                    : ctx.constraints.format === "uri"
                      ? "url"
                      : "text",
            minLength: ctx.constraints.minLength,
            maxLength: ctx.constraints.maxLength,
            pattern: ctx.constraints.pattern,
            placeholder: ctx.meta.description,
        },
        children: [],
    };
}

function renderNumber(ctx: RenderContext): unknown {
    if (ctx.editability === "presentation") {
        return { tag: "span", props: {}, children: [] };
    }

    return {
        tag: "input",
        props: {
            type: "number",
            min: ctx.constraints.minimum,
            max: ctx.constraints.maximum,
        },
        children: [],
    };
}

function renderBoolean(ctx: RenderContext): unknown {
    if (ctx.editability === "presentation") {
        return { tag: "span", props: {}, children: [] };
    }

    return {
        tag: "input",
        props: { type: "checkbox" },
        children: [],
    };
}

function renderEnum(ctx: RenderContext): unknown {
    if (ctx.editability === "presentation") {
        return { tag: "span", props: {}, children: [] };
    }

    return {
        tag: "select",
        props: {},
        children: [],
    };
}

function renderUnknown(ctx: RenderContext): unknown {
    if (ctx.editability === "presentation") {
        return { tag: "span", props: {}, children: [] };
    }

    return {
        tag: "input",
        props: { type: "text" },
        children: [],
    };
}

export const headlessResolver: ComponentResolver = {
    string: renderString,
    number: renderNumber,
    boolean: renderBoolean,
    enum: renderEnum,
    unknown: renderUnknown,
};

/**
 * Look up the render function for a schema type from the resolver.
 */
export function getRenderFunction(
    type: WalkedField["type"],
    resolver: ComponentResolver
): ((ctx: RenderContext) => unknown) | undefined {
    switch (type) {
        case "string":
            return resolver.string;
        case "number":
            return resolver.number;
        case "boolean":
            return resolver.boolean;
        case "enum":
            return resolver.enum;
        case "object":
            return resolver.object;
        case "array":
            return resolver.array;
        case "record":
            return resolver.record;
        case "union":
            return resolver.union;
        case "discriminatedUnion":
            return resolver.union;
        case "literal":
            return resolver.literal;
        case "file":
            return resolver.file;
        default:
            return resolver.unknown;
    }
}
