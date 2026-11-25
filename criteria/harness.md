# Harness criteria (HARN), tool mittens_harness

| ID | Level | Requirement | Proved by |
| --- | --- | --- | --- |
| HARN-001 | SHOULD | The verifier SHOULD check the manifest, then coverage of every MUST criterion, then the cases, then write the report, and SHOULD exit 0 when green, 1 on a failing case, 3 on a broken fence and 4 on an uncovered criterion. | contract: `sh verify/run.sh` with no cases prints "uncovered:" with every MUST ID and exits 4; with one changed case byte it exits 3 before any case runs |
| HARN-002 | SHOULD | The builder SHOULD be unable to change the criteria, the gold cases, the verifier or the loop scripts, by hook and by hash manifest. | contract: an edit to a gold case is refused with "fenced path"; a changed byte makes the manifest check print "fence broken" |
| HARN-003 | SHOULD | Each loop pass SHOULD append exactly one ledger line, written by a script and never by the agent, with the pass number, commit, exit code, pass and fail counts and failing case ids. | contract: `sh loop/record.sh 0 1` appends one line to the ledger with those keys |
