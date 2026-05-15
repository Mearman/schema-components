/**
 * Register real MUI components with the MUI theme adapter.
 */
import { registerMuiComponents } from "schema-components/themes/mui";
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
});
