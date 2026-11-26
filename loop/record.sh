#!/bin/sh
# Appends one line to ledger/iterations.jsonl. Usage: sh loop/record.sh <pass> <exit-code>
# A script writes the ledger, never the agent (HARN-003).
exec node "$(dirname "$0")/record.ts" "$@"
