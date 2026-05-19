/**
 * Build the Mantine resolver against the real `@mantine/core` element
 * types. Exposes `mantineResolver` so the Storybook stories and demo
 * pages can wrap `<SchemaProvider>` around it.
 */
import { createMantineResolver } from "schema-components/themes/mantine";
import {
    TextInput,
    NumberInput,
    Switch,
    Select,
    Fieldset,
    Text,
} from "@mantine/core";

export const mantineResolver = createMantineResolver({
    TextInput,
    NumberInput,
    Switch,
    Select,
    Fieldset,
    Text,
});
