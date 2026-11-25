/** Exit codes of the verifier. The loop script branches on these numbers. */

// A const object, not an enum: Node runs these files by stripping the types,
// and an enum is not erasable syntax.
export const ExitCode = {
  // Every case passed and every MUST criterion has a case.
  GREEN: 0,

  // At least one case failed, or no case could be run.
  RED: 1,

  // The manifest does not match the fenced files. Nothing the run would
  // report can be trusted, so no case runs.
  FENCE_BROKEN: 3,

  // The criteria or the gold set are incomplete or malformed. A human owns
  // both, so the loop stops instead of asking the builder to fix them.
  UNCOVERED: 4,

  // The verifier itself crashed. This says nothing about the build, so it
  // must not look like RED: the loop would start another pass for no reason.
  VERIFIER_ERROR: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
