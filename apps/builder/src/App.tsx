/**
 * Standalone schema builder app.
 *
 * Three input formats: visual builder, raw JSON Schema, or raw OpenAPI document.
 * Preview panel: interactive form powered by SchemaComponent (toggleable read-only) with
 * a swappable theme adapter, an optional validation pass, a raw JSON Schema
 * view, and a collapsible HTML output panel.
 *
 * All user state persists to localStorage under a versioned key.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { SchemaBuilder } from "schema-builder-ui/SchemaBuilder";
import type { BuilderSchema } from "schema-builder-ui/types";
import { toJsonSchema } from "schema-builder-ui/toJsonSchema";
import {
    SchemaComponent,
    SchemaProvider,
} from "schema-components/react/SchemaComponent";
import { SchemaErrorBoundary } from "schema-components/react/SchemaErrorBoundary";
import { renderToHtml } from "schema-components/html/renderToHtml";
import { headlessResolver } from "schema-components/react/headless";
import { shadcnResolver } from "schema-components/themes/shadcn";
import { muiResolver } from "schema-components/themes/mui";
import { mantineResolver } from "schema-components/themes/mantine";
import { radixResolver } from "schema-components/themes/radix";
import type { ComponentResolver } from "schema-components/core/renderer";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "schema-builder-app-v3";
const STORAGE_VERSION = 3;

type InputFormat = "builder" | "jsonschema" | "openapi";
type ThemeName = "headless" | "shadcn" | "mui" | "mantine" | "radix";

interface PersistedState {
    readonly version: number;
    readonly schema: BuilderSchema;
    readonly previewValue: Record<string, unknown>;
    readonly inputFormat: InputFormat;
    readonly rawJsonSchema: string;
    readonly rawOpenApi: string;
    readonly openApiRef: string;
    readonly readOnly: boolean;
    readonly validate: boolean;
    readonly theme: ThemeName;
}

const DEFAULT_STATE: PersistedState = {
    version: STORAGE_VERSION,
    schema: { title: "MySchema", fields: [] },
    previewValue: {},
    inputFormat: "builder",
    rawJsonSchema: "",
    rawOpenApi: "",
    openApiRef: "",
    readOnly: false,
    validate: false,
    theme: "headless",
};

function isInputFormat(x: unknown): x is InputFormat {
    return x === "builder" || x === "jsonschema" || x === "openapi";
}

function isThemeName(x: unknown): x is ThemeName {
    return (
        x === "headless" ||
        x === "shadcn" ||
        x === "mui" ||
        x === "mantine" ||
        x === "radix"
    );
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isPersistedState(x: unknown): x is PersistedState {
    if (!isRecord(x)) return false;
    if (x.version !== STORAGE_VERSION) return false;
    if (!isRecord(x.schema)) return false;
    if (!isRecord(x.previewValue)) return false;
    if (!isInputFormat(x.inputFormat)) return false;
    if (typeof x.rawJsonSchema !== "string") return false;
    if (typeof x.rawOpenApi !== "string") return false;
    if (typeof x.openApiRef !== "string") return false;
    if (typeof x.readOnly !== "boolean") return false;
    if (typeof x.validate !== "boolean") return false;
    if (!isThemeName(x.theme)) return false;
    return true;
}

function loadState(): PersistedState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_STATE;
        const parsed: unknown = JSON.parse(raw);
        if (!isPersistedState(parsed)) return DEFAULT_STATE;
        return parsed;
    } catch {
        return DEFAULT_STATE;
    }
}

// ---------------------------------------------------------------------------
// Theme resolver map
// ---------------------------------------------------------------------------

const RESOLVERS: Readonly<Record<ThemeName, ComponentResolver>> = {
    headless: headlessResolver,
    shadcn: shadcnResolver,
    mui: muiResolver,
    mantine: mantineResolver,
    radix: radixResolver,
};

const THEME_LABELS: Readonly<Record<ThemeName, string>> = {
    headless: "Headless",
    shadcn: "shadcn/ui",
    mui: "MUI",
    mantine: "Mantine",
    radix: "Radix",
};

const THEME_NAMES: readonly ThemeName[] = [
    "headless",
    "shadcn",
    "mui",
    "mantine",
    "radix",
];

const INPUT_FORMATS: readonly InputFormat[] = [
    "builder",
    "jsonschema",
    "openapi",
];

// ---------------------------------------------------------------------------
// JSON Schema helpers
// ---------------------------------------------------------------------------

function tryParseJson(
    raw: string
): { value: unknown; error: undefined } | { value: undefined; error: string } {
    if (raw.trim() === "") return { value: undefined, error: "Empty input" };
    try {
        return { value: JSON.parse(raw), error: undefined };
    } catch (err) {
        return {
            value: undefined,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
    const initial = loadState();

    const [schema, setSchema] = useState<BuilderSchema>(initial.schema);
    const [previewValue, setPreviewValue] = useState<Record<string, unknown>>(
        initial.previewValue
    );
    const [inputFormat, setInputFormat] = useState<InputFormat>(
        initial.inputFormat
    );
    const [rawJsonSchema, setRawJsonSchema] = useState(initial.rawJsonSchema);
    const [rawOpenApi, setRawOpenApi] = useState(initial.rawOpenApi);
    const [openApiRef, setOpenApiRef] = useState(initial.openApiRef);
    const [readOnly, setReadOnly] = useState(initial.readOnly);
    const [validate, setValidate] = useState(initial.validate);
    const [theme, setTheme] = useState<ThemeName>(initial.theme);
    const [htmlOpen, setHtmlOpen] = useState(false);

    // Track previous JSON Schema string so we can reset previewValue on structural change.
    const prevEffectiveSchemaRef = useRef<string>("");

    // Derived: the effective JSON Schema fed to the preview.
    const builderSchema = toJsonSchema(schema);

    let effectiveSchema: unknown = builderSchema;
    let jsonParseError: string | undefined;
    let openApiParseError: string | undefined;

    if (inputFormat === "jsonschema") {
        const result = tryParseJson(rawJsonSchema);
        if (result.error !== undefined) {
            jsonParseError = result.error;
            effectiveSchema = undefined;
        } else {
            effectiveSchema = result.value;
        }
    } else if (inputFormat === "openapi") {
        const result = tryParseJson(rawOpenApi);
        if (result.error !== undefined) {
            openApiParseError = result.error;
            effectiveSchema = undefined;
        } else {
            effectiveSchema = result.value;
        }
    }

    const effectiveSchemaStr = JSON.stringify(effectiveSchema);

    // Reset preview value when the schema structure changes.
    useEffect(() => {
        if (effectiveSchemaStr !== prevEffectiveSchemaRef.current) {
            prevEffectiveSchemaRef.current = effectiveSchemaStr;
            setPreviewValue({});
        }
    }, [effectiveSchemaStr]);

    // Persist all state.
    useEffect(() => {
        const state: PersistedState = {
            version: STORAGE_VERSION,
            schema,
            previewValue,
            inputFormat,
            rawJsonSchema,
            rawOpenApi,
            openApiRef,
            readOnly,
            validate,
            theme,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [
        schema,
        previewValue,
        inputFormat,
        rawJsonSchema,
        rawOpenApi,
        openApiRef,
        readOnly,
        validate,
        theme,
    ]);

    const handleSchemaChange = useCallback((next: BuilderSchema) => {
        setSchema(next);
    }, []);

    const handlePreviewChange = useCallback((next: unknown) => {
        if (isRecord(next)) {
            setPreviewValue(next);
        }
    }, []);

    const resolver = RESOLVERS[theme];

    // HTML output — computed lazily when panel is open.
    let htmlOutput: string | undefined;
    if (htmlOpen && effectiveSchema !== undefined) {
        try {
            htmlOutput = renderToHtml(effectiveSchema, {
                value: previewValue,
                readOnly,
            });
        } catch {
            htmlOutput = undefined;
        }
    }

    return (
        <div style={css.page}>
            <header style={css.header}>
                <div>
                    <h1 style={css.title}>Schema Builder</h1>
                    <p style={css.subtitle}>
                        Build schemas visually or paste JSON Schema / OpenAPI.
                        Preview renders live via schema-components.
                    </p>
                </div>
                <div style={css.toolbar}>
                    <label style={css.toolbarItem}>
                        Theme
                        <select
                            style={css.select}
                            value={theme}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (isThemeName(val)) setTheme(val);
                            }}
                        >
                            {THEME_NAMES.map((t) => (
                                <option key={t} value={t}>
                                    {THEME_LABELS[t]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={css.toolbarCheck}>
                        <input
                            type="checkbox"
                            checked={readOnly}
                            onChange={(e) => {
                                setReadOnly(e.target.checked);
                            }}
                        />
                        Read-only
                    </label>
                    <label style={css.toolbarCheck}>
                        <input
                            type="checkbox"
                            checked={validate}
                            onChange={(e) => {
                                setValidate(e.target.checked);
                            }}
                        />
                        Validate
                    </label>
                </div>
            </header>

            <div style={css.panels}>
                {/* Left panel — input */}
                <div style={css.panel}>
                    <div style={css.tabs}>
                        {INPUT_FORMATS.map((fmt) => (
                            <button
                                key={fmt}
                                type="button"
                                style={
                                    inputFormat === fmt
                                        ? css.tabActive
                                        : css.tab
                                }
                                onClick={() => {
                                    setInputFormat(fmt);
                                }}
                            >
                                {fmt === "builder"
                                    ? "Builder"
                                    : fmt === "jsonschema"
                                      ? "JSON Schema"
                                      : "OpenAPI"}
                            </button>
                        ))}
                    </div>

                    {inputFormat === "builder" && (
                        <SchemaBuilder
                            value={schema}
                            onChange={handleSchemaChange}
                            showPreview={false}
                        />
                    )}

                    {inputFormat === "jsonschema" && (
                        <div>
                            <textarea
                                style={css.textarea}
                                value={rawJsonSchema}
                                placeholder={
                                    '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "properties": {}\n}'
                                }
                                spellCheck={false}
                                onChange={(e) => {
                                    setRawJsonSchema(e.target.value);
                                }}
                            />
                            {jsonParseError !== undefined &&
                                rawJsonSchema.trim() !== "" && (
                                    <p style={css.parseError}>
                                        {jsonParseError}
                                    </p>
                                )}
                        </div>
                    )}

                    {inputFormat === "openapi" && (
                        <div>
                            <label style={css.label}>
                                Schema ref (e.g.{" "}
                                <code>#/components/schemas/User</code>)
                                <input
                                    type="text"
                                    style={css.input}
                                    value={openApiRef}
                                    placeholder="#/components/schemas/MyModel"
                                    onChange={(e) => {
                                        setOpenApiRef(e.target.value);
                                    }}
                                />
                            </label>
                            <textarea
                                style={css.textarea}
                                value={rawOpenApi}
                                placeholder={
                                    '{\n  "openapi": "3.1.0",\n  "info": { "title": "API", "version": "1.0.0" },\n  "components": { "schemas": {} }\n}'
                                }
                                spellCheck={false}
                                onChange={(e) => {
                                    setRawOpenApi(e.target.value);
                                }}
                            />
                            {openApiParseError !== undefined &&
                                rawOpenApi.trim() !== "" && (
                                    <p style={css.parseError}>
                                        {openApiParseError}
                                    </p>
                                )}
                        </div>
                    )}
                </div>

                {/* Right panel — preview */}
                <div style={css.panel}>
                    <section style={css.section}>
                        <h2 style={css.sectionTitle}>Preview</h2>
                        {effectiveSchema !== undefined ? (
                            <SchemaProvider resolver={resolver}>
                                <SchemaErrorBoundary
                                    fallback={(err, reset) => (
                                        <div style={css.errorFallback}>
                                            <p style={css.errorMsg}>
                                                {err.message}
                                            </p>
                                            <button
                                                type="button"
                                                style={css.resetBtn}
                                                onClick={reset}
                                            >
                                                Reset
                                            </button>
                                        </div>
                                    )}
                                >
                                    <SchemaComponent
                                        schema={effectiveSchema}
                                        {...(inputFormat === "openapi" &&
                                        openApiRef !== ""
                                            ? { schemaRef: openApiRef }
                                            : {})}
                                        value={previewValue}
                                        onChange={handlePreviewChange}
                                        readOnly={readOnly}
                                        validate={validate}
                                    />
                                </SchemaErrorBoundary>
                            </SchemaProvider>
                        ) : (
                            <p style={css.emptyState}>
                                {inputFormat === "builder"
                                    ? "Add fields in the builder to see a preview."
                                    : "Paste a valid schema above to see a preview."}
                            </p>
                        )}
                    </section>

                    <section style={css.section}>
                        <h2 style={css.sectionTitle}>JSON Schema</h2>
                        <pre style={css.code}>
                            {effectiveSchema !== undefined
                                ? JSON.stringify(effectiveSchema, null, 2)
                                : "—"}
                        </pre>
                    </section>

                    <section style={css.section}>
                        <button
                            type="button"
                            style={css.collapseToggle}
                            onClick={() => {
                                setHtmlOpen((o) => !o);
                            }}
                            aria-expanded={htmlOpen}
                        >
                            <span style={css.sectionTitle}>HTML output</span>
                            <span aria-hidden="true">
                                {htmlOpen ? " ▾" : " ▸"}
                            </span>
                        </button>
                        {htmlOpen && (
                            <div>
                                <pre style={css.code}>{htmlOutput ?? "—"}</pre>
                                {htmlOutput !== undefined && (
                                    <iframe
                                        style={css.iframe}
                                        title="HTML preview"
                                        srcDoc={htmlOutput}
                                        sandbox="allow-same-origin"
                                    />
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Styles — inline for self-containment; schema-builder-ui/styles.css handles
// the builder component itself.
// ---------------------------------------------------------------------------

const css = {
    page: {
        maxWidth: "80rem",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        minHeight: "100vh",
        background: "#f9fafb",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1rem",
        marginBottom: "1.5rem",
        flexWrap: "wrap" as const,
    },
    title: {
        fontSize: "1.5rem",
        fontWeight: 700,
        margin: "0 0 0.25rem",
    },
    subtitle: {
        color: "#6b7280",
        fontSize: "0.9375rem",
        margin: 0,
    },
    toolbar: {
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap" as const,
    },
    toolbarItem: {
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        fontSize: "0.875rem",
        color: "#374151",
    },
    toolbarCheck: {
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        fontSize: "0.875rem",
        color: "#374151",
        cursor: "pointer",
    },
    select: {
        padding: "0.25rem 0.5rem",
        borderRadius: "0.375rem",
        border: "1px solid #d1d5db",
        background: "#fff",
        fontSize: "0.875rem",
        cursor: "pointer",
    },
    panels: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1.5rem",
        alignItems: "start",
    },
    panel: {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "1rem",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    },
    tabs: {
        display: "flex",
        gap: "0.25rem",
        marginBottom: "1rem",
        borderBottom: "1px solid #e5e7eb",
        paddingBottom: "0.75rem",
    },
    tab: {
        padding: "0.375rem 0.75rem",
        borderRadius: "0.375rem",
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        fontSize: "0.875rem",
        cursor: "pointer",
        color: "#6b7280",
    },
    tabActive: {
        padding: "0.375rem 0.75rem",
        borderRadius: "0.375rem",
        border: "1px solid #6366f1",
        background: "#eef2ff",
        fontSize: "0.875rem",
        cursor: "pointer",
        color: "#4338ca",
        fontWeight: 500,
    },
    section: {
        marginBottom: "1.25rem",
    },
    sectionTitle: {
        fontSize: "0.8125rem",
        fontWeight: 600,
        color: "#6b7280",
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        margin: "0 0 0.5rem",
        display: "block" as const,
    },
    code: {
        padding: "0.75rem",
        background: "#1e293b",
        color: "#e2e8f0",
        borderRadius: "0.5rem",
        fontSize: "0.8125rem",
        lineHeight: 1.6,
        overflow: "auto",
        maxHeight: "16rem",
        margin: 0,
        whiteSpace: "pre-wrap" as const,
        wordBreak: "break-word" as const,
    },
    iframe: {
        width: "100%",
        minHeight: "12rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        marginTop: "0.5rem",
        background: "#fff",
    },
    emptyState: {
        color: "#9ca3af",
        fontSize: "0.875rem",
        margin: "0.5rem 0",
    },
    textarea: {
        width: "100%",
        minHeight: "16rem",
        padding: "0.625rem",
        fontFamily: "ui-monospace, monospace",
        fontSize: "0.8125rem",
        lineHeight: 1.6,
        border: "1px solid #d1d5db",
        borderRadius: "0.5rem",
        resize: "vertical" as const,
        boxSizing: "border-box" as const,
        background: "#f9fafb",
    },
    parseError: {
        color: "#dc2626",
        fontSize: "0.8125rem",
        marginTop: "0.375rem",
        fontFamily: "ui-monospace, monospace",
    },
    label: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "0.25rem",
        fontSize: "0.875rem",
        color: "#374151",
        marginBottom: "0.5rem",
    },
    input: {
        padding: "0.375rem 0.625rem",
        border: "1px solid #d1d5db",
        borderRadius: "0.375rem",
        fontSize: "0.875rem",
        background: "#fff",
    },
    collapseToggle: {
        background: "none",
        border: "none",
        padding: "0 0 0.5rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
        width: "100%",
        textAlign: "left" as const,
    },
    errorFallback: {
        padding: "0.75rem",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: "0.5rem",
        fontSize: "0.875rem",
    },
    errorMsg: {
        color: "#dc2626",
        margin: "0 0 0.5rem",
        fontFamily: "ui-monospace, monospace",
    },
    resetBtn: {
        padding: "0.25rem 0.75rem",
        border: "1px solid #d1d5db",
        borderRadius: "0.375rem",
        background: "#fff",
        fontSize: "0.8125rem",
        cursor: "pointer",
    },
} as const;
