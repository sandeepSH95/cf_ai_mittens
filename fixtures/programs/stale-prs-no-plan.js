async () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STALE_DAYS = 30;
  const now = Date.parse("2026-11-01T00:00:00.000Z");

  const open = await github.listPullRequests({ state: "open" });
  const stale = open.filter((pr) => !pr.draft && (now - Date.parse(pr.updatedAt)) / DAY_MS > STALE_DAYS);

  return {
    summary: stale.length + " of " + open.length + " open pull requests are stale.",
    stale: stale.map((pr) => ({ number: pr.number, title: pr.title, updatedAt: pr.updatedAt }))
  };
}
