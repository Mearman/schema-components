import type { Meta, StoryObj } from "@storybook/react";
import { DemoCard, DemoGrid, StoryPage } from "../src/story-layout.tsx";

const snippets = {
    mui: `import { registerMuiComponents } from "schema-components/themes/mui";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";

registerMuiComponents({
  TextField,
  Checkbox,
  Typography,
  Box,
  MenuItem,
  FormControlLabel,
});`,
    mantine: `import { registerMantineComponents } from "schema-components/themes/mantine";
import { TextInput, NumberInput, Switch, Select, Fieldset } from "@mantine/core";
import "@mantine/core/styles.css";

registerMantineComponents({
  TextInput,
  NumberInput,
  Switch,
  Select,
  Fieldset,
});`,
    radix: `import { registerRadixComponents } from "schema-components/themes/radix";
import { Box, Checkbox, Flex, Select, Text, TextField } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";

registerRadixComponents({
  Box,
  Checkbox,
  Flex,
  SelectRoot: Select.Root,
  SelectTrigger: Select.Trigger,
  SelectContent: Select.Content,
  SelectItem: Select.Item,
  Text,
  TextField: TextField.Root,
});`,
    shadcn: `import "./tailwind.css";
import { shadcnResolver } from "schema-components/themes/shadcn";

<SchemaProvider resolver={shadcnResolver}>
  <SchemaComponent schema={schema} value={value} />
</SchemaProvider>`,
};

function CodeBlock({ code }: { code: string }) {
    return (
        <pre
            style={{
                background: "#0f172a",
                borderRadius: "0.5rem",
                color: "#e2e8f0",
                fontSize: "0.75rem",
                lineHeight: 1.6,
                margin: 0,
                overflow: "auto",
                padding: "1rem",
            }}
        >
            {code}
        </pre>
    );
}

function AdapterSetup() {
    return (
        <StoryPage
            title="Adapter setup"
            description="Component-library adapters keep heavy UI packages out of the published core package. Consumers install their UI library and register the components once at application startup."
        >
            <DemoGrid>
                <DemoCard title="MUI">
                    <CodeBlock code={snippets.mui} />
                </DemoCard>
                <DemoCard title="Mantine">
                    <CodeBlock code={snippets.mantine} />
                </DemoCard>
                <DemoCard title="Radix Themes">
                    <CodeBlock code={snippets.radix} />
                </DemoCard>
                <DemoCard title="shadcn/Tailwind">
                    <CodeBlock code={snippets.shadcn} />
                </DemoCard>
            </DemoGrid>
        </StoryPage>
    );
}

const meta: Meta<typeof AdapterSetup> = {
    title: "Theme Adapters/Setup",
    component: AdapterSetup,
    tags: ["theme-adapter"],
};

export default meta;
type Story = StoryObj<typeof AdapterSetup>;

export const Default: Story = {
    render: () => <AdapterSetup />,
};
