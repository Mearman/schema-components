import { defineConfig } from "tsdown";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "react/index": "src/react/index.ts",
        "core/index": "src/core/index.ts",
        "openapi/index": "src/openapi/index.ts",
    },
    format: "esm",
    dts: true,
});
