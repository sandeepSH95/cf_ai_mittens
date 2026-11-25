import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";

// Builds the React chat page into dist/. wrangler.jsonc serves dist/ as assets.
export default defineConfig({
  plugins: [agents(), react()],
  build: { outDir: "dist", emptyOutDir: true }
});
