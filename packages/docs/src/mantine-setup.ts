/**
 * Register real Mantine components with the Mantine theme adapter.
 */
import { registerMantineComponents } from "schema-components/themes/mantine";
import { TextInput, NumberInput, Switch, Select, Fieldset } from "@mantine/core";

registerMantineComponents({
    TextInput,
    NumberInput,
    Switch,
    Select,
    Fieldset,
});
