/**
 * Standalone schema builder app.
 *
 * Three input formats: visual builder, raw JSON Schema, or raw OpenAPI document.
 * Preview panel: tabbed view of the interactive preview, raw JSON Schema output,
 * and raw HTML output — powered by schema-components with a swappable theme
 * adapter and optional validation pass.
 *
 * All user state persists to localStorage under a versioned key.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { z } from "zod";
import { EXAMPLES } from "@schema-components/examples";
import { SchemaBuilder } from "schema-builder-ui/SchemaBuilder";
import type {
    BuilderSchema,
    BuilderField,
    FieldMeta,
} from "schema-builder-ui/types";
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

const STORAGE_KEY = "schema-builder-app-v4";
const STORAGE_VERSION = 5;

type InputFormat = "builder" | "jsonschema" | "openapi";
type ThemeName = "headless" | "shadcn" | "mui" | "mantine" | "radix";
type PreviewTab = "preview" | "jsonschema" | "html" | "setup";
type ColourScheme = "auto" | "light" | "dark";

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
    readonly previewTab: PreviewTab;
    readonly colourScheme: ColourScheme;
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
    previewTab: "preview",
    colourScheme: "auto",
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

function isPreviewTab(x: unknown): x is PreviewTab {
    return (
        x === "preview" || x === "jsonschema" || x === "html" || x === "setup"
    );
}

function isColourScheme(x: unknown): x is ColourScheme {
    return x === "auto" || x === "light" || x === "dark";
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
    if (!isPreviewTab(x.previewTab)) return false;
    if (!isColourScheme(x.colourScheme)) return false;
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

const ADAPTER_SNIPPETS: Readonly<Record<ThemeName, string>> = {
    headless: `import { SchemaComponent } from "schema-components/react/SchemaComponent";

// No extra setup needed — renders with plain HTML inputs.
<SchemaComponent schema={schema} value={value} onChange={setValue} />`,

    shadcn: `import { shadcnResolver } from "schema-components/themes/shadcn";
import { SchemaProvider, SchemaComponent } from "schema-components/react/SchemaComponent";
import "./tailwind.css"; // your Tailwind stylesheet

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={schema} value={value} onChange={setValue} />
</SchemaProvider>`,

    mui: `import { createMuiResolver } from "schema-components/themes/mui";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import { SchemaProvider, SchemaComponent } from "schema-components/react/SchemaComponent";

const resolver = createMuiResolver({
  TextField,
  Checkbox,
  Typography,
  Box,
  MenuItem,
  FormControlLabel,
});

<SchemaProvider resolver={resolver}>
  <SchemaComponent schema={schema} value={value} onChange={setValue} />
</SchemaProvider>`,

    mantine: `import { createMantineResolver } from "schema-components/themes/mantine";
import { TextInput, NumberInput, Switch, Select, Fieldset, Text } from "@mantine/core";
import "@mantine/core/styles.css";
import { SchemaProvider, SchemaComponent } from "schema-components/react/SchemaComponent";

const resolver = createMantineResolver({
  TextInput,
  NumberInput,
  Switch,
  Select,
  Fieldset,
  Text,
});

<SchemaProvider resolver={resolver}>
  <SchemaComponent schema={schema} value={value} onChange={setValue} />
</SchemaProvider>`,

    radix: `import { createRadixResolver } from "schema-components/themes/radix";
import { Box, Checkbox, Flex, Select, Text, TextField } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { SchemaProvider, SchemaComponent } from "schema-components/react/SchemaComponent";

const resolver = createRadixResolver({
  Box,
  Checkbox,
  Flex,
  SelectRoot: Select.Root,
  SelectTrigger: Select.Trigger,
  SelectContent: Select.Content,
  SelectItem: Select.Item,
  Text,
  TextField: TextField.Root,
});

<SchemaProvider resolver={resolver}>
  <SchemaComponent schema={schema} value={value} onChange={setValue} />
</SchemaProvider>`,
};

const INPUT_FORMATS: readonly InputFormat[] = [
    "builder",
    "jsonschema",
    "openapi",
];

const PREVIEW_TABS: readonly {
    readonly id: PreviewTab;
    readonly label: string;
}[] = [
    { id: "preview", label: "Preview" },
    { id: "jsonschema", label: "JSON Schema" },
    { id: "html", label: "HTML" },
    { id: "setup", label: "Adapter setup" },
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
// Schema format conversion helpers
// ---------------------------------------------------------------------------

function extractSchemaFromOpenApi(doc: unknown, ref: string): unknown {
    if (!isRecord(doc)) return undefined;
    if (ref === "") {
        if (isRecord(doc.components) && isRecord(doc.components.schemas)) {
            const firstKey = Object.keys(doc.components.schemas)[0];
            return firstKey !== undefined
                ? doc.components.schemas[firstKey]
                : undefined;
        }
        return undefined;
    }
    if (!ref.startsWith("#/")) return undefined;
    const parts = ref.slice(2).split("/");
    let current: unknown = doc;
    for (const part of parts) {
        if (!isRecord(current)) return undefined;
        current = current[part];
    }
    return current;
}

function wrapInOpenApi(schema: unknown): {
    readonly doc: unknown;
    readonly ref: string;
} {
    const schemaTitle =
        isRecord(schema) &&
        typeof schema.title === "string" &&
        schema.title !== ""
            ? schema.title
            : "Schema";
    const schemaName = schemaTitle.replace(/\s+/g, "");
    return {
        doc: {
            openapi: "3.1.0",
            info: { title: `${schemaTitle} API`, version: "1.0.0" },
            components: { schemas: { [schemaName]: schema } },
        },
        ref: `#/components/schemas/${schemaName}`,
    };
}

function parseFieldMeta(schema: Record<string, unknown>): FieldMeta {
    return {
        ...(typeof schema.title === "string" &&
            schema.title !== "" && { title: schema.title }),
        ...(schema.readOnly === true && { readOnly: true }),
        ...(schema.writeOnly === true && { writeOnly: true }),
        ...(schema.deprecated === true && { deprecated: true }),
        ...(typeof schema["x-component"] === "string" && {
            component: schema["x-component"],
        }),
        ...(typeof schema["x-order"] === "number" && {
            order: schema["x-order"],
        }),
        ...(schema.default !== undefined && {
            defaultRaw: JSON.stringify(schema.default),
        }),
        ...(Array.isArray(schema.examples) &&
            schema.examples.length > 0 && {
                examplesRaw: schema.examples.map(String).join(", "),
            }),
    };
}

function jsonSchemaToBuilderField(
    name: string,
    schema: unknown,
    required: boolean
): BuilderField | undefined {
    if (!isRecord(schema)) return undefined;
    const description =
        typeof schema.description === "string" ? schema.description : "";
    const meta = parseFieldMeta(schema);
    const base = { id: crypto.randomUUID(), name, required, description, meta };

    if ("const" in schema) {
        return {
            ...base,
            type: "literal",
            constraints: { valueRaw: JSON.stringify(schema.const) },
        };
    }

    if (Array.isArray(schema.enum)) {
        return {
            ...base,
            type: "enum",
            constraints: { values: schema.enum.map(String) },
        };
    }

    const { type } = schema;

    if (type === "string") {
        if (schema.contentEncoding === "base64") {
            return {
                ...base,
                type: "file",
                constraints:
                    typeof schema.contentMediaType === "string"
                        ? { contentMediaType: schema.contentMediaType }
                        : {},
            };
        }
        return {
            ...base,
            type: "string",
            constraints: {
                ...(typeof schema.minLength === "number" && {
                    minLength: schema.minLength,
                }),
                ...(typeof schema.maxLength === "number" && {
                    maxLength: schema.maxLength,
                }),
                ...(typeof schema.pattern === "string" && {
                    pattern: schema.pattern,
                }),
                ...(typeof schema.format === "string" && {
                    format: schema.format,
                }),
                ...(typeof schema.contentEncoding === "string" && {
                    contentEncoding: schema.contentEncoding,
                }),
                ...(typeof schema.contentMediaType === "string" && {
                    contentMediaType: schema.contentMediaType,
                }),
            },
        };
    }

    if (type === "number") {
        return {
            ...base,
            type: "number",
            constraints: {
                ...(typeof schema.minimum === "number" && {
                    minimum: schema.minimum,
                }),
                ...(typeof schema.maximum === "number" && {
                    maximum: schema.maximum,
                }),
                ...(typeof schema.exclusiveMinimum === "number" && {
                    exclusiveMinimum: schema.exclusiveMinimum,
                }),
                ...(typeof schema.exclusiveMaximum === "number" && {
                    exclusiveMaximum: schema.exclusiveMaximum,
                }),
                ...(typeof schema.multipleOf === "number" && {
                    multipleOf: schema.multipleOf,
                }),
            },
        };
    }

    if (type === "integer") {
        return {
            ...base,
            type: "integer",
            constraints: {
                ...(typeof schema.minimum === "number" && {
                    minimum: schema.minimum,
                }),
                ...(typeof schema.maximum === "number" && {
                    maximum: schema.maximum,
                }),
                ...(typeof schema.exclusiveMinimum === "number" && {
                    exclusiveMinimum: schema.exclusiveMinimum,
                }),
                ...(typeof schema.exclusiveMaximum === "number" && {
                    exclusiveMaximum: schema.exclusiveMaximum,
                }),
                ...(typeof schema.multipleOf === "number" && {
                    multipleOf: schema.multipleOf,
                }),
            },
        };
    }

    if (type === "boolean") {
        return { ...base, type: "boolean", constraints: {} };
    }

    if (type === "null") {
        return { ...base, type: "null", constraints: {} };
    }

    if (
        type === "object" ||
        isRecord(schema.properties) ||
        isRecord(schema.additionalProperties)
    ) {
        if (
            !isRecord(schema.properties) &&
            isRecord(schema.additionalProperties)
        ) {
            const valueField = jsonSchemaToBuilderField(
                "value",
                schema.additionalProperties,
                false
            );
            if (valueField !== undefined) {
                const propertyNamesPattern =
                    isRecord(schema.propertyNames) &&
                    typeof schema.propertyNames.pattern === "string"
                        ? schema.propertyNames.pattern
                        : undefined;
                return {
                    ...base,
                    type: "record",
                    constraints:
                        propertyNamesPattern !== undefined
                            ? { propertyNamesPattern }
                            : {},
                    valueField,
                };
            }
        }
        const properties = isRecord(schema.properties) ? schema.properties : {};
        const requiredArr = Array.isArray(schema.required)
            ? schema.required.filter((v): v is string => typeof v === "string")
            : [];
        const children: BuilderField[] = [];
        for (const [childName, childSchema] of Object.entries(properties)) {
            const child = jsonSchemaToBuilderField(
                childName,
                childSchema,
                requiredArr.includes(childName)
            );
            if (child !== undefined) children.push(child);
        }
        return {
            ...base,
            type: "object",
            constraints: {
                ...(typeof schema.minProperties === "number" && {
                    minProperties: schema.minProperties,
                }),
                ...(typeof schema.maxProperties === "number" && {
                    maxProperties: schema.maxProperties,
                }),
            },
            children,
        };
    }

    if (type === "array") {
        if (Array.isArray(schema.prefixItems)) {
            const prefixItems: BuilderField[] = [];
            for (let i = 0; i < schema.prefixItems.length; i++) {
                const item: unknown = schema.prefixItems[i];
                const f = jsonSchemaToBuilderField(
                    `item${String(i)}`,
                    item,
                    false
                );
                if (f !== undefined) prefixItems.push(f);
            }
            return {
                ...base,
                type: "tuple",
                constraints: {},
                prefixItems,
                closed: schema.items === false,
            };
        }
        const itemSchema: unknown =
            schema.items !== undefined ? schema.items : {};
        const fallbackItemField: BuilderField = {
            id: crypto.randomUUID(),
            name: "item",
            required: false,
            description: "",
            meta: {},
            type: "string",
            constraints: {},
        };
        const itemField =
            jsonSchemaToBuilderField("item", itemSchema, false) ??
            fallbackItemField;
        return {
            ...base,
            type: "array",
            constraints: {
                ...(typeof schema.minItems === "number" && {
                    minItems: schema.minItems,
                }),
                ...(typeof schema.maxItems === "number" && {
                    maxItems: schema.maxItems,
                }),
                ...(schema.uniqueItems === true && { uniqueItems: true }),
            },
            itemField,
        };
    }

    return undefined;
}

function fromJsonSchema(schema: unknown): BuilderSchema | undefined {
    if (!isRecord(schema)) return undefined;
    if (schema.type !== "object" && !isRecord(schema.properties))
        return undefined;
    const title =
        typeof schema.title === "string" && schema.title !== ""
            ? schema.title
            : "MySchema";
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const requiredArr = Array.isArray(schema.required)
        ? schema.required.filter((v): v is string => typeof v === "string")
        : [];
    const fields: BuilderField[] = [];
    for (const [name, fieldSchema] of Object.entries(properties)) {
        const field = jsonSchemaToBuilderField(
            name,
            fieldSchema,
            requiredArr.includes(name)
        );
        if (field !== undefined) fields.push(field);
    }
    return { title, fields };
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
    const [previewTab, setPreviewTab] = useState<PreviewTab>(
        initial.previewTab
    );
    const [colourScheme, setColourScheme] = useState<ColourScheme>(
        initial.colourScheme
    );
    const [isDirty, setIsDirty] = useState(false);
    const [copied, setCopied] = useState(false);

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

    // Sync colour scheme to <html> so CSS variables cascade to <body> and
    // the page background fills edge-to-edge beyond the max-width container.
    useEffect(() => {
        document.documentElement.dataset.sbTheme = colourScheme;
        return () => {
            delete document.documentElement.dataset.sbTheme;
        };
    }, [colourScheme]);

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
            previewTab,
            colourScheme,
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
        previewTab,
        colourScheme,
    ]);

    const handleInputFormatChange = useCallback(
        (newFormat: InputFormat) => {
            if (newFormat === inputFormat) return;

            // Derive the source schema from the current format before switching.
            let sourceSchema: unknown;
            if (inputFormat === "builder") {
                sourceSchema = toJsonSchema(schema);
            } else if (inputFormat === "jsonschema") {
                const result = tryParseJson(rawJsonSchema);
                if (result.error === undefined) sourceSchema = result.value;
            } else {
                const result = tryParseJson(rawOpenApi);
                if (result.error === undefined) {
                    sourceSchema = extractSchemaFromOpenApi(
                        result.value,
                        openApiRef
                    );
                }
            }

            if (sourceSchema !== undefined) {
                if (newFormat === "jsonschema") {
                    setRawJsonSchema(JSON.stringify(sourceSchema, null, 2));
                } else if (newFormat === "builder") {
                    const next = fromJsonSchema(sourceSchema);
                    if (next !== undefined) setSchema(next);
                } else {
                    const { doc, ref } = wrapInOpenApi(sourceSchema);
                    setRawOpenApi(JSON.stringify(doc, null, 2));
                    setOpenApiRef(ref);
                }
            }

            setInputFormat(newFormat);
        },
        [inputFormat, schema, rawJsonSchema, rawOpenApi, openApiRef]
    );

    const handleSchemaChange = useCallback((next: BuilderSchema) => {
        setIsDirty(true);
        setSchema(next);
    }, []);

    const handlePreviewChange = useCallback((next: unknown) => {
        if (isRecord(next)) {
            setPreviewValue(next);
        }
    }, []);

    const handleExampleSelect = useCallback(
        (id: string) => {
            if (id === "") return;
            const ex = EXAMPLES.find((e) => e.id === id);
            if (ex === undefined) return;

            if (
                isDirty &&
                !window.confirm(
                    `Load "${ex.name}"? This replaces your current schema.`
                )
            ) {
                return;
            }

            if (ex.format === "zod") {
                const js: unknown = z.toJSONSchema(ex.schema);
                const next = fromJsonSchema(js);
                if (next !== undefined) {
                    setSchema(next);
                    setInputFormat("builder");
                } else {
                    setRawJsonSchema(JSON.stringify(js, null, 2));
                    setInputFormat("jsonschema");
                }
                if (isRecord(ex.data)) setPreviewValue(ex.data);
                else setPreviewValue({});
            } else {
                setRawOpenApi(JSON.stringify(ex.spec, null, 2));
                setOpenApiRef(ex.ref);
                setInputFormat("openapi");
                setPreviewValue(ex.data);
            }
            setIsDirty(false);
        },
        [isDirty]
    );

    const handleCopySnippet = useCallback(() => {
        void navigator.clipboard.writeText(ADAPTER_SNIPPETS[theme]);
        setCopied(true);
        setTimeout(() => {
            setCopied(false);
        }, 2000);
    }, [theme]);

    const resolver = RESOLVERS[theme];

    // HTML output — computed lazily when the HTML tab is active.
    let htmlOutput: string | undefined;
    if (previewTab === "html" && effectiveSchema !== undefined) {
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
        <div style={css.page} data-sb-theme={colourScheme}>
            <header style={css.header}>
                <div>
                    <h1 style={css.title}>Schema Builder</h1>
                    <p style={css.subtitle}>
                        Build schemas visually or paste JSON Schema / OpenAPI.
                        Preview renders live via schema-components.
                    </p>
                </div>
                <div style={css.toolbar}>
                    <label
                        style={css.toolbarItem}
                        title="Component-library adapter used to render preview components."
                    >
                        Adapter
                        <select
                            style={css.select}
                            value={theme}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (isThemeName(val)) {
                                    setTheme(val);
                                    setCopied(false);
                                }
                            }}
                        >
                            {THEME_NAMES.map((t) => (
                                <option key={t} value={t}>
                                    {THEME_LABELS[t]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label
                        style={css.toolbarCheck}
                        title="Render the preview without inputs — shows what the form looks like in view-only mode."
                    >
                        <input
                            type="checkbox"
                            checked={readOnly}
                            onChange={(e) => {
                                setReadOnly(e.target.checked);
                            }}
                        />
                        View mode
                    </label>
                    <label
                        style={css.toolbarCheck}
                        title="Validate the live preview value against the schema."
                    >
                        <input
                            type="checkbox"
                            checked={validate}
                            onChange={(e) => {
                                setValidate(e.target.checked);
                            }}
                        />
                        Validate
                    </label>
                    <label
                        style={css.toolbarItem}
                        title="Colour scheme for the builder UI. Auto follows your OS setting."
                    >
                        Scheme
                        <select
                            style={css.select}
                            value={colourScheme}
                            onChange={(e) => {
                                if (isColourScheme(e.target.value))
                                    setColourScheme(e.target.value);
                            }}
                        >
                            <option value="auto">Auto</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </label>
                    <label
                        style={css.toolbarItem}
                        title="Load a worked example into the builder."
                    >
                        Examples
                        <select
                            style={css.select}
                            value=""
                            onChange={(e) => {
                                handleExampleSelect(e.target.value);
                            }}
                        >
                            <option value="">Load…</option>
                            {EXAMPLES.map((ex) => (
                                <option key={ex.id} value={ex.id}>
                                    {ex.name}
                                </option>
                            ))}
                        </select>
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
                                    handleInputFormatChange(fmt);
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
                                    setIsDirty(true);
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
                                    setIsDirty(true);
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

                {/* Right panel — tabbed preview */}
                <div style={css.panel}>
                    <div style={css.tabs}>
                        {PREVIEW_TABS.map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                style={
                                    previewTab === id ? css.tabActive : css.tab
                                }
                                onClick={() => {
                                    setPreviewTab(id);
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {previewTab === "preview" && (
                        <>
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
                        </>
                    )}

                    {previewTab === "jsonschema" && (
                        <pre style={css.code}>
                            {effectiveSchema !== undefined
                                ? JSON.stringify(effectiveSchema, null, 2)
                                : "—"}
                        </pre>
                    )}

                    {previewTab === "html" && (
                        <>
                            <pre style={css.code}>{htmlOutput ?? "—"}</pre>
                            {htmlOutput !== undefined && (
                                <iframe
                                    style={css.iframe}
                                    title="HTML preview"
                                    srcDoc={htmlOutput}
                                    sandbox="allow-same-origin"
                                />
                            )}
                        </>
                    )}

                    {previewTab === "setup" && (
                        <div>
                            <div style={css.snippetHeader}>
                                <span style={css.snippetLabel}>
                                    {THEME_LABELS[theme]}
                                </span>
                                <button
                                    type="button"
                                    style={css.copyBtn}
                                    onClick={handleCopySnippet}
                                >
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <pre style={css.code}>
                                {ADAPTER_SNIPPETS[theme]}
                            </pre>
                        </div>
                    )}
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
        background: "var(--sb-bg-subtle)",
        color: "var(--sb-fg)",
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
        color: "var(--sb-fg-muted)",
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
        color: "var(--sb-fg-secondary)",
    },
    toolbarCheck: {
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        fontSize: "0.875rem",
        color: "var(--sb-fg-secondary)",
        cursor: "pointer",
    },
    select: {
        padding: "0.25rem 0.5rem",
        borderRadius: "0.375rem",
        border: "1px solid var(--sb-border-input)",
        background: "var(--sb-bg)",
        color: "var(--sb-fg)",
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
        background: "var(--sb-bg)",
        border: "1px solid var(--sb-border)",
        borderRadius: "0.75rem",
        padding: "1rem",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    },
    tabs: {
        display: "flex",
        gap: "0.25rem",
        marginBottom: "1rem",
        borderBottom: "1px solid var(--sb-border)",
        paddingBottom: "0.75rem",
    },
    tab: {
        padding: "0.375rem 0.75rem",
        borderRadius: "0.375rem",
        border: "1px solid var(--sb-border)",
        background: "var(--sb-bg-subtle)",
        fontSize: "0.875rem",
        cursor: "pointer",
        color: "var(--sb-fg-muted)",
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
    code: {
        padding: "0.75rem",
        background: "var(--sb-code-bg)",
        color: "var(--sb-code-fg)",
        borderRadius: "0.5rem",
        fontSize: "0.8125rem",
        lineHeight: 1.6,
        overflow: "auto",
        maxHeight: "32rem",
        margin: 0,
        whiteSpace: "pre-wrap" as const,
        wordBreak: "break-word" as const,
    },
    iframe: {
        width: "100%",
        minHeight: "12rem",
        border: "1px solid var(--sb-border)",
        borderRadius: "0.5rem",
        marginTop: "0.5rem",
        background: "var(--sb-bg)",
    },
    emptyState: {
        color: "var(--sb-fg-muted)",
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
        border: "1px solid var(--sb-border-input)",
        borderRadius: "0.5rem",
        resize: "vertical" as const,
        boxSizing: "border-box" as const,
        background: "var(--sb-bg-subtle)",
        color: "var(--sb-fg)",
    },
    parseError: {
        color: "var(--sb-danger)",
        fontSize: "0.8125rem",
        marginTop: "0.375rem",
        fontFamily: "ui-monospace, monospace",
    },
    label: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "0.25rem",
        fontSize: "0.875rem",
        color: "var(--sb-fg-secondary)",
        marginBottom: "0.5rem",
    },
    input: {
        padding: "0.375rem 0.625rem",
        border: "1px solid var(--sb-border-input)",
        borderRadius: "0.375rem",
        fontSize: "0.875rem",
        background: "var(--sb-bg)",
        color: "var(--sb-fg)",
    },
    errorFallback: {
        padding: "0.75rem",
        background: "var(--sb-danger-bg)",
        border: "1px solid var(--sb-danger-border)",
        borderRadius: "0.5rem",
        fontSize: "0.875rem",
    },
    errorMsg: {
        color: "var(--sb-danger)",
        margin: "0 0 0.5rem",
        fontFamily: "ui-monospace, monospace",
    },
    resetBtn: {
        padding: "0.25rem 0.75rem",
        border: "1px solid var(--sb-border-input)",
        borderRadius: "0.375rem",
        background: "var(--sb-bg)",
        color: "var(--sb-fg)",
        fontSize: "0.8125rem",
        cursor: "pointer",
    },
    snippetHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "0.5rem",
    },
    snippetLabel: {
        fontSize: "0.875rem",
        fontWeight: 500,
        color: "var(--sb-fg-secondary)",
    },
    copyBtn: {
        padding: "0.25rem 0.75rem",
        border: "1px solid var(--sb-border-input)",
        borderRadius: "0.375rem",
        background: "var(--sb-bg)",
        color: "var(--sb-fg)",
        fontSize: "0.8125rem",
        cursor: "pointer",
        minWidth: "4.5rem",
    },
} as const;
