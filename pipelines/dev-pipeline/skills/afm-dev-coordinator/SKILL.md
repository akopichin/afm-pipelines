---
name: afm-dev-coordinator
description: Coordinate AFM mesh writers and temporary helpers with durable request IDs, bounded waits, accepted evidence and completion cleanup. Use for stage agents that delegate development, consultation or review in a shared worktree.
---

# AFM stage coordination

The calling flow owns stage ordering, artifact paths, role/profile selection,
budgets, approvals and acceptance gates. This skill supplies the collaboration
protocol. Writers implement assigned changes; the coordinator integrates evidence
and never edits files while a writer owns them. Use AFM communication, not native
Agent/Task/fork subagents, nested orchestration or parent-run mutation APIs.

Read [temporary helpers](references/helpers.md) before spawning a helper and when
reconciling helpers before completion. Read [diagnosis and handoff](references/diagnosis.md)
when a defect repeats or an owner/tool becomes unavailable. These are workflow
rules, not an automatic runtime watchdog or a grant of additional permissions.

## Recover before dispatch

At every resumed turn reconcile the flow's ledger (normally team-progress.json),
`<your_requests>`, `<your_helpers>`, `<inbox>` and `afm agent wait-status`.
AFM's durable records are authoritative: recover existing requests and receipts
before creating work. Persist IDs, logical task/section, owner, brief revision,
batch ID, last processed message sequence, acceptance decisions and repair counts
atomically. Keep evidence in referenced artifacts rather than large messages.

Resolve standing writer aliases with `afm agent list`. Temporary helpers are not
standing aliases: use participant IDs returned by spawn. Give every work item a
versioned brief with the exact task, owned files (including tests/generated files),
baseline/current diff, criteria, canonical request, check owner/budget and evidence
references. Parallel work needs disjoint file ownership; otherwise sequence it.

For Board tasks, write the complete task before assignment. Assignment already
sends a request: save its message ID, do not send a duplicate implementation
request. Additional context is an ordinary message naming that canonical ID.
Require the writer's explicit final `afm agent reply --in-reply-to <request-id>`.
Board done or an automatic result may refer to another waking message and cannot
replace this reply. Reconcile inherited separate requests individually.

## Changes during work

Before new check batches, at milestones and before delivery, all participants
read incremental inbox updates and the latest brief. Update the brief before
sending changed user guidance. The recipient confirms the applied revision and
already-running checks with an ordinary message, not a final reply or new request.
Record that confirmation before relying on the change. Sent/delivered does not
mean applied; a message need not interrupt a live turn. Never create an extra
reply_to wait just to acknowledge instructions. Reconcile actual completed checks
before assigning reviewer experiments, using the flow's evidence policy.

## Wait and accept

Send independent work before registering one batch wait for the round:

```sh
afm agent wait --condition reply_to_all --message-ids <canonical-ids> --deadline-seconds <finite-budget>
```

Respect the tool's batch size limit (up to 16 IDs). Inspect existing waits before
registering and recover their IDs. On `yield`, save
the batch and END THE TURN without a completion marker. A callback question may
wake you before the original batch resolves: answer its own message ID, then
reconcile the original wait. Do not restart it or assume the callback completed it.
For recovery use `inbox --all --cursor <saved-seq> --limit 50`, page until caught up,
and advance the cursor only after saving dispositions. Do not poll in shell loops.

A ready batch can include expired/cancelled requests. Inspect every reason and
the deliverable: acknowledgement or partial status is not acceptance. Request the
missing final deliverable through one linked follow-up, not a replay of the task
or another wait on an already-satisfied request. A timeout does not release file
ownership; confirm the writer and its modifying commands stopped before handoff.

Inspect actual changes, ownership and required evidence before accepting work.
The writer's edits are already in the shared tree: never reapply its diff. Missing
test-first evidence cannot be invented from a green tree. During a review batch,
freeze the candidate: no writer tasks, coordinator edits or file-rewriting checks.
Collect all outcomes, deduplicate findings into bounded corrections per writer,
and preserve earlier findings and repair counts. Gates remain the flow's decision.

## Complete deliberately

Before any completion summary/marker, reconcile ALL of your actual pending waits
with accepted work. If an accepted deliverable answered the wrong message, obtain
the writer's explicit linked reply to the canonical request without redoing work.
Cancel only your own proven-superseded waits through a supported command or your
own descriptor's authenticated mesh cancel-wait endpoint. Record IDs, reason and
evidence; never print secrets, borrow tokens, use operator APIs or edit state.json
or events.jsonl. Reconcile the entire obsolete set during the active turn.

Real unfinished requests/reviews remain blocking; cancellation is not pass. Also
reconcile your temporary helpers using the helper reference. If needed recovery
is unavailable, report task/wait IDs and the concrete missing capability instead
of claiming completion or repeatedly yielding unchanged. Do not cancel another
stage's helpers or idle run-scoped writers merely to make the run exit.
