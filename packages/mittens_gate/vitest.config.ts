import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

// Tests run inside workerd. This package needs no binding.
export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" }
    })
  ],
  test: { include: ["test/**/*.test.ts"], testTimeout: 30000 }
});
