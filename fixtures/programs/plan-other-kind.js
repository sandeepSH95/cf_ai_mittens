async () => {
  const TARGET_NUMBER = 102;

  return { summary: "1 branch delete planned.", plan: { writes: [{ kind: "delete_branch", number: TARGET_NUMBER }] } };
}
