import { useState } from "react";
import { Card as RadixCard, Theme as RadixTheme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { MantineProvider, createTheme as createMantineTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import type { z } from "zod";
import { SchemaComponent } from "schema-components/react/SchemaComponent";
import { SchemaProvider } from "schema-components/react/SchemaComponent";
import { muiResolver } from "schema-components/themes/mui";
import { mantineResolver } from "schema-components/themes/mantine";
import { radixResolver } from "schema-components/themes/radix";
import { shadcnResolver } from "schema-components/themes/shadcn";

import "./mantine-setup.ts";
import "./mui-setup.ts";
import "./radix-setup.ts";
import "./tailwind.css";

const muiTheme = createTheme({ palette: { mode: "light" } });
const mantineTheme = createMantineTheme({});

export type ThemeName = "headless" | "mui" | "mantine" | "radix" | "shadcn";

export const themeNames: readonly ThemeName[] = [
    "headless",
    "mui",
    "mantine",
    "radix",
    "shadcn",
];

export function ThemeSchemaDemo({
    readOnly = false,
    schema,
    theme,
    value,
}: {
    readOnly?: boolean;
    schema: z.ZodType;
    theme: ThemeName;
    value: unknown;
}) {
    const [currentValue, setCurrentValue] = useState<unknown>(value);
    const component = (
        <SchemaComponent
            schema={schema}
            value={currentValue}
            onChange={(next) => {
                setCurrentValue(next);
            }}
            readOnly={readOnly}
        />
    );

    if (theme === "headless") {
        return component;
    }

    if (theme === "mui") {
        return (
            <MuiThemeProvider theme={muiTheme}>
                <CssBaseline />
                <SchemaProvider resolver={muiResolver}>
                    {component}
                </SchemaProvider>
            </MuiThemeProvider>
        );
    }

    if (theme === "mantine") {
        return (
            <MantineProvider theme={mantineTheme} defaultColorScheme="light">
                <SchemaProvider resolver={mantineResolver}>
                    {component}
                </SchemaProvider>
            </MantineProvider>
        );
    }

    if (theme === "radix") {
        return (
            <RadixTheme appearance="light" accentColor="blue" radius="medium">
                <RadixCard>
                    <SchemaProvider resolver={radixResolver}>
                        {component}
                    </SchemaProvider>
                </RadixCard>
            </RadixTheme>
        );
    }

    return (
        <SchemaProvider resolver={shadcnResolver}>
            <div className="max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-6">
                {component}
            </div>
        </SchemaProvider>
    );
}
