async () => {
  const open = await github.listPullRequests({ state: "open" });
  const numbers = open.map((pr) => pr.number);

  return { open: open.length, lowest: Math.min(...numbers), highest: Math.max(...numbers) };
}
