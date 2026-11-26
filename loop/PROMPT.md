You are one pass of a build loop. The verifier decides when the work is done. You do not.

1. Read HANDOFF.md if it exists, then ledger/last-run.json.
2. For each failing case id, read the criteria it covers in criteria/ and the contract in verify/runner/CONTRACT.md.
3. Change only files under packages/ and apps/. Never touch criteria/, fixtures/, gold/, verify/, loop/ or .claude/. If a case looks wrong, say so in HANDOFF.md and move on; a human owns those files.
4. Implement the criterion. Do not special-case the input of a gold case. A fix that only passes the case and not the criterion is a failure a held-out case will catch.
5. Run: sh verify/run.sh. Read the diffs it prints.
6. Fix the smallest set of failing cases you can finish in this pass. Do not break a case that passed when the pass started.
7. Commit with the template in .gitmessage: subject "Pass: <what you fixed>", body with the failing ids before and after. Never push.
8. Rewrite HANDOFF.md: what you changed, what still fails, what you suspect, under 40 lines.
9. Stop.
