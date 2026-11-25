#!/bin/sh
# The one entry point of the verifier, for the loop, the Stop hook and CI.
# Node 24 runs TypeScript directly by stripping the types. No build step.
exec node "$(dirname "$0")/run.ts" "$@"
