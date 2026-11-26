#!/bin/sh
# Runs builder passes until the verifier is green or a cap in loop/caps.env stops the run.
# Exit 0 green, 1 cap reached, 3 or 4 or 5 a human must look.
exec node "$(dirname "$0")/loop.ts" "$@"
