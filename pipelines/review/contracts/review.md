# Independent review contract

Read the agreed scope.json, brief.md, changes.patch and files.json under the
sibling scope stage. Use the source root recorded there. Follow applicable
project instructions. Inspect changed code and its callers, not only a diff or
another agent's summary. Review only problems introduced by the selected change;
label existing defects separately. For a non-Git file review, review the agreed
files as they are and state that regression attribution is unavailable.

Do not modify source, dependencies, configuration, the Git index or history.
Do not fetch, checkout, stash, clean, commit, install tools, start an app or run
broad suites. Read-only prompts do not provide OS isolation on a native host.
Prefer source evidence and existing check results. Only a specifically granted,
bounded reproduction may run; write its files under granted scratch if possible.
No managed browser, delegation, native subagents or nested AFM runs.

Each concrete finding needs a stable local ID, title, P0/P1/P2/P3 priority,
confidence, source path and line range, the triggering input or sequence, actual
versus expected behavior, impact, evidence and a minimal corrective direction.
Use P0 for urgent widespread breakage, P1 for serious supported-scenario defects,
P2 for ordinary actionable defects, P3 for low-impact defects. Style preferences
and speculative refactors are not defects. Test gaps alone need a concrete risk.
Distinguish source reasoning from a reproduction actually executed.

Return all findings in ONE final result using the injected AFM helper JSON
contract, putting full evidence in supported detail/evidence fields. Do not invent
extra top-level fields or a different output schema. In AFM findings, map P0 to
`severity: blocker`, P1 to `major`, P2 to `minor`, P3 to `info`; put the priority,
title, confidence and scenario in `detail`, not unsupported JSON fields. Respect
the injected verdict constraints; a finding does not require an implementation.
Include coverage, limitations
and any existing defects in the summary/evidence. A clean completed review may
have no findings; cancellation, timeout and unavailable inputs are incomplete.
No acknowledgement-only final answer. Do not create a stage completion marker.

Do not rely on other reviewers' findings before your independent pass. On a
necessary clarification ask the stage coordinator using granted AFM messaging
and a finite deadline. End after your final answer; do not wait for acknowledgement.
