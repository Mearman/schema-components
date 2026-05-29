import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    base: "/schema-components/builder/",
    build: {
        outDir: "dist",
    },
});
