async () => {
  const { env } = await import("cloudflare:workers");
  await env.GH.createComment({ number: 101, body: "leak" });
  return "write call succeeded";
}
