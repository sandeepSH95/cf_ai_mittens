import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import agents from "agents/vite";

// The page imports its own files as "@/...". Example: "@/lib/utils" is src/app/lib/utils.ts.
const APP_ALIAS = "@";
const APP_ROOT = fileURLToPath(new URL("./src/app", import.meta.url));

// Builds the React page into dist/. wrangler.jsonc serves dist/ as assets.
export default defineConfig({
  plugins: [agents(), react(), tailwindcss()],
  resolve: { alias: { [APP_ALIAS]: APP_ROOT } },
  build: { outDir: "dist", emptyOutDir: true }
});
