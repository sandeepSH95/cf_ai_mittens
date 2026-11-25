async () => {
  const BODY_LENGTH = 4001;
  const TARGET_NUMBER = 101;

  const body = "x".repeat(BODY_LENGTH);

  return { summary: "1 comment of " + BODY_LENGTH + " characters planned.", plan: { writes: [{ kind: "comment", number: TARGET_NUMBER, body }] } };
}
