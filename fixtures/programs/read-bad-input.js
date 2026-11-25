async () => {
  try {
    const pull = await github.getPullRequest({ number: "101" });
    return { rejected: false, title: pull.title };
  } catch (error) {
    return { rejected: true, message: error.message };
  }
}
