# Repeated defects and mandatory ownership handoff

## Count the work, not the reviewers

Initial implementation and the first correction belong to backend/frontend
writers. After **two rejected candidate rounds for the same logical work item**,
escalate before a third correction/review round. Two unsuccessful repairs also
trigger escalation even if they failed checks before review. A lower explicit
flow ceiling still applies; a higher budget never postpones this checkpoint.

A round is the complete selected review batch for one candidate: two reviewers
rejecting it count once. Include blocking AI verify and live acceptance outcomes
in the same history; the same candidate rejected by multiple gates is not several
repair attempts. Count only completed outcomes requiring an in-scope correction,
not individual findings, ACKs, optional polish, expected TDD red, diagnostic
experiments, infrastructure failures or cancelled/inconclusive reviews.

Group changing symptoms by logical task and underlying invariant. A new finding
ID, narrower reproduction, helper, writer, stage, session or restart does not
reset the history. Import earlier implement/live/verify evidence before dispatch.
Unrelated work items have separate histories; a stage's total review count is
not the trigger for every task in it.
If the grouping is uncertain, ask the diagnosis agent to resolve it; do not start
another ordinary repair while deciding. A user-requested handoff can happen earlier.

Keep in the task's team-progress.json entry: logical task/invariant, `review_rounds`
(each round's candidate identity, result/request IDs, verdict and dispositions),
`rejected_rounds`, `failed_repairs`, and an `escalation` record. Reconcile counts
against durable AFM replies and reports, rather than trusting a stale number.

## Required route: Astra diagnosis, Opus implementation

The standing diagnosis agent is team ID `rescue-architect` (default GPT-6 Astra
`xhigh`); the reserve writer is team ID `opus` (default Opus 5.5 `xhigh`). Resolve
participant IDs and actual model/command bindings from the run's roster and frozen
configuration. The historical IDs are not model identities. Use the configured
bindings; report a missing role or incompatible access rather than silently
substituting another writer. Both roles remain idle during ordinary work.

At the threshold the route is mandatory, not an optional consultation followed
by another fix from the original writer:

1. Finish the selected review batch and preserve every full result. Confirm the
   old writer AND its modifying commands have stopped; freeze the candidate.
2. Record `escalation.trigger`, prior task/request IDs and counts, candidate and
   evidence paths, previous owner's release, diagnosis assignee, canonical request
   ID and finite budget. Send ONE bounded diagnosis request to `rescue-architect`,
   using the afm-dev-diagnosis skill. This is a standing run agent: use `send`/`reply`
   and save its full linked deliverable, not `helper-result` or a new helper.
3. Give the diagnosis agent the original requirement, all repair/review history,
   current diff, failing commands/logs, attempted hypotheses and scratch grant.
   Require root cause, a distinguishing reproduction, the smallest corrective
   design, evidence testing that design and required regression scenarios.
   Separate product defects, missing regression guards and faulty test harnesses.
   A green rerun alone does not refute a failure. The diagnosis may use scratch
   prototypes; it does not edit the product or weaken approved acceptance.
4. Read and accept the diagnosis, including counterevidence and limitations.
   Store its request/reply IDs, artifact and acceptance in the same escalation
   record. Acknowledgement or untested advice is not an accepted diagnosis. If
   bounded experiments cannot distinguish the cause, report the concrete blocker.
5. Transfer the bounded implementation to `opus`, NEVER back to the original
   writer after this threshold. Record the new owner, file/test grant, diagnosis,
   canonical request ID and acceptance/check budget before waiting. The writer
   requires this record before editing. Other writers and the coordinator leave
   the granted files untouched. Do not use a temporary read-only helper as writer.
6. Obtain fresh independent review of the corrected candidate and regression
   evidence, then the required checks and affected live acceptance. Astra's
   diagnosis, the writer's reply and green unit tests are not final acceptance.
   Preserve the logical task and counters throughout this rescue.

An explicit user direction can override the route or assign implementation to
Astra: record the original instruction, changed owner/access and grant. Anyone
who edited product code cannot independently approve that candidate. Such an
exception does not silently become the normal pipeline route.

## Bound the rescue

One escalation permits one diagnosis and one specialist-guided implementation
with independent acceptance. If that correction is rejected or fails the same
invariant in live acceptance, report the concrete blocker through the flow's
dialog protocol. Do not restart Astra -> Opus, return to an ordinary writer or
reset counters automatically. A user-authorized retry records the new input and
bounded budget on the same work item; unchanged failure alone is not permission.
Task size, subsystem boundaries and spare capacity do not activate these roles.
Routine escalation within the approved scope needs no additional user approval.

## Unavailable participants or capabilities

Authentication errors, missing commands and unreachable participants call for an
infrastructure response. Record the actual error and inspect roster/capabilities.
Select a reachable replacement with the needed access and independence only after
reconciling pending work and confirming the prior writer stopped. Do not keep
sending to a failed participant or replace required independent review with
self-review. With no suitable replacement, report the missing capability and
remaining work. Own only processes you started; no kills by name or pattern,
shared-environment changes, token borrowing or parent-run state mutations.
