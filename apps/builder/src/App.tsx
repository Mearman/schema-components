/**
 * Standalone schema builder app.
 *
 * Two-panel layout: builder on the left, live form preview on the right.
 * Schemas persist to localStorage.
 */
import { useState, useEffect, useCallback } from "react";
import { SchemaBuilder } from "schema-builder-ui/SchemaBuilder";
import type { BuilderSchema } from "schema-builder-ui/types";
import { toJsonSchema } from "schema-builder-ui/toJsonSchema";
import { SchemaComponent } from "schema-components/react/SchemaComponent";

const STORAGE_KEY = "schema-builder-app";

function loadSchema(): BuilderSchema {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as BuilderSchema;
    } catch {
        // Corrupt data — start fresh.
    }
    return { title: "MySchema", fields: [] };
}

function saveSchema(schema: BuilderSchema): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
}

export function App() {
    const [schema, setSchema] = useState<BuilderSchema>(loadSchema);

    useEffect(() => {
        saveSchema(schema);
    }, [schema]);

    const handleChange = useCallback((next: BuilderSchema) => {
        setSchema(next);
    }, []);

    const jsonSchema = toJsonSchema(schema);

    return (
        <div style={styles.page}>
            <header style={styles.header}>
                <h1 style={styles.title}>Schema Builder</h1>
                <p style={styles.subtitle}>
                    Build JSON Schemas visually. Drag to reorder, click ▸ to
                    configure constraints.
                </p>
            </header>
            <div style={styles.panels}>
                <div style={styles.panel}>
                    <SchemaBuilder
                        value={schema}
                        onChange={handleChange}
                        showPreview={false}
                    />
                </div>
                <div style={styles.panel}>
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>Live form preview</h2>
                        <SchemaComponent
                            schema={jsonSchema}
                            value={{}}
                            readOnly
                        />
                    </section>
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>JSON Schema</h2>
                        <pre style={styles.code}>
                            {JSON.stringify(jsonSchema, null, 2)}
                        </pre>
                    </section>
                </div>
            </div>
        </div>
    );
}

const styles = {
    page: {
        maxWidth: "72rem",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
    },
    header: {
        marginBottom: "1.5rem",
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
    panels: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1.5rem",
    },
    panel: {
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "1rem",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        alignSelf: "start",
    },
    section: {
        marginBottom: "1rem",
    },
    sectionTitle: {
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "#6b7280",
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        margin: "0 0 0.5rem",
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
    },
} as const;
