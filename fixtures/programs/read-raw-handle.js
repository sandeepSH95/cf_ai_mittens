async () => {
  const { env } = await import("cloudflare:workers");
  const open = await env.GH.listPullRequests({ state: "open" });

  return { open: open.length };
}
