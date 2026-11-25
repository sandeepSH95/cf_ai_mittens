/**
 * The one workerd module the adapter imports, typed for the root tsconfig.
 *
 *   adapter (inside workerd) --import { env }--> "cloudflare:workers"
 *
 * The root tsconfig checks verify/ with the Node types only, so the Workers
 * types are not loaded. The adapter reads two bindings and checks both at
 * run time, so `unknown` values are enough here.
 */

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
