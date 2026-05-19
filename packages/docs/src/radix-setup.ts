/**
 * Build the Radix Themes resolver against the real `@radix-ui/themes`
 * element types. Exposes `radixResolver` so the Storybook stories and
 * demo pages can wrap `<SchemaProvider>` around it.
 */
import { createRadixResolver } from "schema-components/themes/radix";
import {
    Box,
    Checkbox,
    Flex,
    Select,
    Text,
    TextField,
} from "@radix-ui/themes";

export const radixResolver = createRadixResolver({
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
