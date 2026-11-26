async () => {
  const { env } = await import("cloudflare:workers");

  try {
    await env.GH.createComment({ number: 101, body: "leak" });
  } catch {
    return { write: "rejected" };
  }

  return { write: "accepted" };
}
