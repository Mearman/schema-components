/**
 * Register real Radix Themes components with the Radix adapter.
 */
import { registerRadixComponents } from "schema-components/themes/radix";
import {
    Box,
    Checkbox,
    Flex,
    Select,
    Text,
    TextField,
} from "@radix-ui/themes";

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
});
