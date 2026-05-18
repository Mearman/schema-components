import { addons, types } from "storybook/manager-api";
import { IconButton } from "storybook/internal/components";
import { createElement } from "react";

const ADDON_ID = "schema-components/api-reference";
const TOOL_ID = `${ADDON_ID}/tool`;

const API_REFERENCE_URL = "https://mearman.github.io/schema-components/";

addons.register(ADDON_ID, () => {
    addons.add(TOOL_ID, {
        type: types.TOOL,
        title: "API reference",
        match: () => true,
        render: () =>
            createElement(
                IconButton,
                {
                    key: TOOL_ID,
                    title: "Open the TypeDoc API reference",
                    onClick: () =>
                        window.open(
                            API_REFERENCE_URL,
                            "_blank",
                            "noopener,noreferrer",
                        ),
                },
                "API ↗",
            ),
    });
});
