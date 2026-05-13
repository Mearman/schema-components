import { createContext, useContext, useCallback, type ReactNode } from "react";
import { walk, type WalkOptions } from "../core/walker.ts";
import { headlessResolver } from "../core/renderer.ts";
import type {
    ComponentResolver,
    SchemaMeta,
    WalkedField,
    ZodSchema,
} from "../core/types.ts";

const ResolverContext = createContext<ComponentResolver>(headlessResolver);

export function SchemaProvider({
    resolver,
    children,
}: {
    resolver: ComponentResolver;
    children: ReactNode;
}) {
    return (
        <ResolverContext.Provider value={resolver}>
            {children}
        </ResolverContext.Provider>
    );
}

export interface SchemaComponentProps {
    schema: unknown;
    ref?: string;
    value?: unknown;
    onChange?: (value: unknown) => void;
    validate?: boolean;
    onValidationError?: (error: unknown) => void;
    fields?: Record<string, Partial<SchemaMeta>>;
    meta?: SchemaMeta;
    readOnly?: boolean;
    writeOnly?: boolean;
    description?: string;
}

export interface SchemaFieldProps {
    path: string;
    render?: (props: {
        value: unknown;
        onChange: (v: unknown) => void;
    }) => ReactNode;
}

export function SchemaComponent({
    schema: schemaInput,
    value,
    onChange,
    validate,
    onValidationError,
    fields,
    meta: componentMeta,
    readOnly,
    writeOnly,
    description,
}: SchemaComponentProps): ReactNode {
    const resolver = useContext(ResolverContext);

    const mergedMeta: SchemaMeta = { ...componentMeta };
    if (readOnly === true) mergedMeta.readOnly = true;
    if (writeOnly === true) mergedMeta.writeOnly = true;
    if (description !== undefined) mergedMeta.description = description;

    const handleChange = useCallback(
        (nextValue: unknown) => {
            if (validate && isZodSchema(schemaInput)) {
                const safeParseFn = getProperty(schemaInput, "safeParse");
                if (isCallable(safeParseFn)) {
                    const result: unknown = safeParseFn(nextValue);
                    if (
                        isObject(result) &&
                        "success" in result &&
                        result.success !== true
                    ) {
                        const error = getProperty(result, "error");
                        onValidationError?.(error);
                        return;
                    }
                }
            }
            onChange?.(nextValue);
        },
        [validate, schemaInput, onChange, onValidationError]
    );

    if (isZodSchema(schemaInput)) {
        const walkOptions: WalkOptions = {
            componentMeta: mergedMeta,
            fieldOverrides: fields,
        };

        const tree = walk(schemaInput, walkOptions);
        return renderTree(tree, resolver, value, handleChange);
    }

    return null;
}

export function SchemaField(_props: SchemaFieldProps): ReactNode {
    void _props;
    return null;
}

function renderTree(
    tree: WalkedField,
    resolver: ComponentResolver,
    value: unknown,
    onChange: (v: unknown) => void,
    path = ""
): ReactNode {
    if (tree.type === "object" && tree.fields) {
        const obj = isObject(value) ? value : {};
        return (
            <fieldset>
                {typeof tree.meta.description === "string" && (
                    <legend>{tree.meta.description}</legend>
                )}
                {Object.entries(tree.fields).map(([key, field]) => {
                    const childPath = path ? `${path}.${key}` : key;
                    const childValue = getProperty(obj, key);
                    const childOnChange = (v: unknown) => {
                        const updated: Record<string, unknown> = {};
                        for (const [k, val] of Object.entries(obj)) {
                            updated[k] = val;
                        }
                        updated[key] = v;
                        onChange(updated);
                    };
                    return (
                        <div key={key}>
                            {typeof field.meta.description === "string" && (
                                <label>{field.meta.description}</label>
                            )}
                            {renderTree(
                                field,
                                resolver,
                                childValue,
                                childOnChange,
                                childPath
                            )}
                        </div>
                    );
                })}
            </fieldset>
        );
    }

    if (tree.type === "array" && tree.element) {
        const arr = Array.isArray(value) ? value : [];
        return (
            <div>
                {arr.map((item, i) => {
                    const childPath = `${path}[${String(i)}]`;
                    const childOnChange = (v: unknown) => {
                        const next = arr.slice();
                        next[i] = v;
                        onChange(next);
                    };
                    return (
                        <div key={i}>
                            {tree.element &&
                                renderTree(
                                    tree.element,
                                    resolver,
                                    item,
                                    childOnChange,
                                    childPath
                                )}
                        </div>
                    );
                })}
            </div>
        );
    }

    if (tree.editability === "presentation") {
        return renderPresentation(tree, value);
    }

    if (tree.editability === "input") {
        return renderEditable(tree, undefined, onChange);
    }

    return renderEditable(tree, value, onChange);
}

function renderPresentation(tree: WalkedField, value: unknown): ReactNode {
    if (value === null || value === undefined) return <span>—</span>;
    if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
    if (typeof value === "number") return <span>{value.toLocaleString()}</span>;
    if (typeof value === "string") {
        const format = tree.constraints.format;
        if (format === "email" && value.length > 0) {
            return <a href={`mailto:${value}`}>{value}</a>;
        }
        if ((format === "uri" || format === "url") && value.length > 0) {
            return <a href={value}>{value}</a>;
        }
        return <span>{value}</span>;
    }
    return <span>{JSON.stringify(value)}</span>;
}

function renderEditable(
    tree: WalkedField,
    value: unknown,
    onChange: (v: unknown) => void
): ReactNode {
    switch (tree.type) {
        case "string": {
            const strValue = typeof value === "string" ? value : "";
            if (tree.enumValues !== undefined && tree.enumValues.length > 0) {
                return (
                    <select
                        value={strValue}
                        onChange={(e) => {
                            onChange(e.target.value);
                        }}
                    >
                        <option value="">Select…</option>
                        {tree.enumValues.map((v) => (
                            <option key={v} value={v}>
                                {v}
                            </option>
                        ))}
                    </select>
                );
            }
            return (
                <input
                    type={
                        tree.constraints.format === "email"
                            ? "email"
                            : tree.constraints.format === "uri"
                              ? "url"
                              : "text"
                    }
                    value={strValue}
                    onChange={(e) => {
                        onChange(e.target.value);
                    }}
                    placeholder={
                        typeof tree.meta.description === "string"
                            ? tree.meta.description
                            : undefined
                    }
                    minLength={tree.constraints.minLength}
                    maxLength={tree.constraints.maxLength}
                />
            );
        }

        case "number": {
            const numValue = typeof value === "number" ? value : "";
            return (
                <input
                    type="number"
                    value={numValue}
                    onChange={(e) => {
                        onChange(Number(e.target.value));
                    }}
                    min={tree.constraints.minimum}
                    max={tree.constraints.maximum}
                />
            );
        }

        case "boolean": {
            const boolValue = value === true;
            return (
                <input
                    type="checkbox"
                    checked={boolValue}
                    onChange={(e) => {
                        onChange(e.target.checked);
                    }}
                />
            );
        }

        case "enum": {
            const enumValue = typeof value === "string" ? value : "";
            return (
                <select
                    value={enumValue}
                    onChange={(e) => {
                        onChange(e.target.value);
                    }}
                >
                    <option value="">Select…</option>
                    {tree.enumValues?.map((v) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            );
        }

        default:
            return (
                <span>
                    {typeof value === "string" ? value : JSON.stringify(value)}
                </span>
            );
    }
}

function isZodSchema(value: unknown): value is ZodSchema {
    return (
        typeof value === "object" &&
        value !== null &&
        ("_zod" in value || "_def" in value)
    );
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
}

function getProperty(obj: Record<string, unknown>, key: string): unknown {
    return obj[key];
}
