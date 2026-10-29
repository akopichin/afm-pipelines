# Repeated defects and ownership handoff

Use the calling flow's repair ceiling; by default, two unsuccessful repairs or a
second rejection of the same underlying defect require independent diagnosis
before another correction. Count across requests, helpers, stages, sessions and
verify/live reruns. Renaming a task or narrowing a reproduction does not reset
the count. Expected TDD red and planned diagnostic checks are not failed repairs.

State the invariant, symptom, suspected cause, distinguishing check and observed
result. A published status may precede deferred cleanup: reason about ownership,
durable commit and completion together. Reproduce relevant interleavings with
controlled gates; prefer fixing the invariant to adding another local guard.
A green rerun alone neither diagnoses a flake nor refutes a reported interleaving.

Request a bounded diagnosis from an independent configured architect/reviewer
for the affected domain. Use a more capable configured model where appropriate,
without inventing profiles. Include the logical task, current diff/owned files,
invariant, failing command/logs, attempted hypotheses, prior IDs and counters.
Ask for root cause, a check distinguishing alternatives and the smallest corrective
design. Read the committed result before another fix; a finished consultant is
not an active participant. Resolve concrete findings with changes or evidence.

If a different implementation owner is needed, first confirm the previous writer
AND its modifying commands stopped. Record the new owner, explicit file/test
grant, diagnosis, prior IDs and acceptance checks, then send the bounded fix.
Neither the old owner nor coordinator touches those files during the handoff.
A read-only architect cannot replace the implementation writer. An explicit user
request to hand off takes effect immediately, without another self-fix attempt.

After the specialist-guided correction, evaluate evidence and required gates.
If the defect persists, or the design requires material scope changes, report
the concrete blocker through the flow's dialog protocol rather than starting
another rescue loop. A successful handoff does not waive independent review.

## Unavailable participants or capabilities

Authentication errors, missing commands and unreachable participants call for an
infrastructure response. Record the actual error and inspect roster/capabilities.
Select a reachable replacement with the needed access and independence only after
reconciling pending work and confirming the prior writer stopped. Do not keep
sending to a failed participant or replace required independent review with
self-review. With no suitable replacement, report the missing capability and
remaining work. Own only processes you started; no kills by name or pattern,
shared-environment changes, token borrowing or parent-run state mutations.
