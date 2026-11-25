async () => {
  const WRITE_COUNT = 26;

  const writes = [];
  for (let number = 1; number <= WRITE_COUNT; number += 1) {
    writes.push({ kind: "comment", number, body: "Planned comment " + number + " of " + WRITE_COUNT + "." });
  }

  return { summary: WRITE_COUNT + " comments planned.", plan: { writes } };
}
