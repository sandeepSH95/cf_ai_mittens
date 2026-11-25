async () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STALE_DAYS = 30;
  const now = Date.parse("2026-11-01T00:00:00.000Z");

  const open = await github.listPullRequests({ state: "open" });
  const stale = open.filter((pr) => !pr.draft && (now - Date.parse(pr.updatedAt)) / DAY_MS > STALE_DAYS);

  const writes = [];
  for (const pr of stale) {
    const comments = await github.listComments({ number: pr.number });
    const lastVoice = comments.length > 0 ? comments[comments.length - 1].author : "nobody";
    writes.push({
      kind: "comment",
      number: pr.number,
      body: "This pull request has had no activity for more than " + STALE_DAYS + " days (last comment by " + lastVoice + "). Please rebase it or close it."
    });
  }

  return {
    summary: stale.length + " of " + open.length + " open pull requests are stale.",
    stale: stale.map((pr) => ({ number: pr.number, title: pr.title, updatedAt: pr.updatedAt })),
    plan: { writes }
  };
}
