import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import agents from "agents/vite";
import { CANARY_GITHUB_TOKEN } from "mittens_attack/canary";

// Tests run inside workerd. The canary token is the value the exfiltration
// suite tries to find inside the sandbox. It is not a real token.
export default defineConfig({
  plugins: [
    agents(),
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { GITHUB_TOKEN: CANARY_GITHUB_TOKEN } }
    })
  ],
  test: { include: ["test/**/*.test.ts"], testTimeout: 30000 }
});
