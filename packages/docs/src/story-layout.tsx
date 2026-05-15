import type { ReactNode } from "react";

export function StoryPage({
    children,
    description,
    title,
}: {
    children: ReactNode;
    description?: string;
    title: string;
}) {
    return (
        <div
            style={{
                display: "grid",
                gap: "1.25rem",
                maxWidth: "72rem",
                padding: "0.5rem",
            }}
        >
            <header style={{ display: "grid", gap: "0.25rem" }}>
                <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{title}</h1>
                {description !== undefined && (
                    <p
                        style={{
                            color: "var(--sc-text-muted)",
                            fontSize: "0.9375rem",
                            lineHeight: 1.6,
                            margin: 0,
                        }}
                    >
                        {description}
                    </p>
                )}
            </header>
            {children}
        </div>
    );
}

export function StorySection({
    children,
    description,
    title,
}: {
    children: ReactNode;
    description?: string;
    title: string;
}) {
    return (
        <section style={{ display: "grid", gap: "0.75rem" }}>
            <header style={{ display: "grid", gap: "0.125rem" }}>
                <h2 style={{ fontSize: "1.125rem", margin: 0 }}>{title}</h2>
                {description !== undefined && (
                    <p
                        style={{
                            color: "var(--sc-text-muted)",
                            fontSize: "0.875rem",
                            lineHeight: 1.5,
                            margin: 0,
                        }}
                    >
                        {description}
                    </p>
                )}
            </header>
            {children}
        </section>
    );
}

export function DemoCard({
    children,
    title,
}: {
    children: ReactNode;
    title?: string;
}) {
    return (
        <div
            style={{
                background: "var(--sc-card-bg)",
                border: "1px solid var(--sc-card-border)",
                borderRadius: "0.75rem",
                boxShadow: "var(--sc-card-shadow)",
                display: "grid",
                gap: "0.75rem",
                padding: "1rem",
            }}
        >
            {title !== undefined && (
                <h3 style={{ fontSize: "1rem", margin: 0 }}>{title}</h3>
            )}
            {children}
        </div>
    );
}

export function DemoGrid({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
            }}
        >
            {children}
        </div>
    );
}

export function JsonPanel({ value }: { value: unknown }) {
    return (
        <pre
            style={{
                background: "var(--sc-bg-secondary)",
                borderRadius: "0.75rem",
                color: "var(--sc-text)",
                fontSize: "0.8125rem",
                lineHeight: 1.6,
                margin: 0,
                overflow: "auto",
                padding: "1rem",
            }}
        >
            {JSON.stringify(value, null, 2)}
        </pre>
    );
}
