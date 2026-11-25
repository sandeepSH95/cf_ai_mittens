async () => {
  const READ_NUMBERS = [101, 102, 104, 105, 106];

  const repo = await github.getRepo();
  const open = await github.listPullRequests({ state: "open" });

  let comments = 0;
  for (const number of READ_NUMBERS) {
    const list = await github.listComments({ number });
    comments += list.length;
  }

  return { repo: repo.fullName, open: open.length, comments, reads: 2 + READ_NUMBERS.length };
}
