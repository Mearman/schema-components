/**
 * Build the MUI resolver against the real `@mui/material` element types.
 * Exposes `muiResolver` so the Storybook stories and demo pages can wrap
 * `<SchemaProvider>` around it.
 */
import { createMuiResolver } from "schema-components/themes/mui";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";

export const muiResolver = createMuiResolver({
    TextField,
    Checkbox,
    Typography,
    Box,
    MenuItem,
    FormControlLabel,
});
