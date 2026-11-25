async () => {
  const workers = await import("cloudflare:workers");
  const env = workers.env ?? {};
  return { envKeys: Object.keys(env), tokenType: typeof env.GITHUB_TOKEN };
}
