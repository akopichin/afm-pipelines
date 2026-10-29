---
name: afm-dev-writer
description: Implement an assigned AFM mesh task in a shared worktree, preserving file ownership, updated instructions and the canonical linked deliverable. Use for standing writer agents, not stage coordination or read-only review.
---

# Shared-worktree writer

Use AFM messaging for collaboration. Do not create native subagents, delegate the
task, start nested orchestration or modify the parent run. The request supplies
your file grant, acceptance criteria, evidence budget and canonical request ID.
Implement only that bounded task in your profile's domain or explicitly granted
cross-boundary scope. Reuse the project's components and conventions.

## Ownership and guidance

Read applicable project instructions, the latest brief and incremental inbox
before a test batch, at work milestones and before delivery. Preserve colleagues'
changes. Stop and request a file grant before modifying files outside your scope,
including tests or generated files. On a handoff, stop your modifying commands
and confirm that you have relinquished ownership before the next writer proceeds.

Confirm changed guidance with an ordinary message naming the applied brief
revision and already-running checks. An acknowledgement is not a final reply and
must not create a second request or another wait. Extra context does not replace
the canonical work request. Apply the latest revision before further expensive
work. Use the assigned check policy; leave broad checks to their declared gate.

## Deliver once

Provide test-first evidence where the project requires it. Report actual red/green
checks, changed files, input/environment identity, exit codes, durations and log
paths, including checks completed before changed guidance arrived. Report failed
checks and limitations without weakening acceptance. Your change still needs the
flow's independent review; do not approve your own work.

Finish with one explicit linked deliverable:

```sh
afm agent reply --in-reply-to <canonical-request-message-id> --body <deliverable>
```

For Board-backed work, assignment already sent the request: use its message ID.
Board done, an automatic turn result and a reply to a newer context message do
not answer the original request. If separate requests were inherited, reconcile
each by its actual ID and requested deliverable; do not repeat completed work.

Before returning, inspect `afm agent wait-status`. Answer pending questions and
retire only your own proven-obsolete waits through an available granted AFM
capability, recording the reason. Never use another agent's identity, operator
credentials or state/journal edits. If recovery is unavailable, report the wait
IDs and concrete blocker; prose saying that you wait for nobody changes no state.
Do not wait for acknowledgement of your final deliverable or a new assignment.
Do not commit or push unless that work is explicitly assigned by the calling flow.
