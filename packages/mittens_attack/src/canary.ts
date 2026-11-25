/**
 * The token value the test runtime holds host-side (the vitest.config.ts of the demo app puts it
 * in env.GITHUB_TOKEN). The exfiltration suite tries to find it inside the
 * sandbox. It is not a real token.
 */
export const CANARY_GITHUB_TOKEN = "ghp_CANARY_TOKEN_MUST_NOT_LEAK_0123456789";
