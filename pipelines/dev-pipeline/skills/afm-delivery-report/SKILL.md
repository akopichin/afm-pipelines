---
name: afm-delivery-report
description: Produce an evidence-backed user-facing live acceptance or final delivery report in an AFM flow. Use at reporting stages, not to launch new tests or reviews.
---

# Report what was delivered and exercised

Use the user's language and the calling flow's artifact paths and verdict schema.
Read the approved plan, stage summaries, recorded live result and applicable
check receipts. Open detailed logs only to resolve a discrepancy. Reporting alone
does not justify new tests, helpers, approvals or file changes in the product.

Present a readable report directly in the final assistant reply AND save it to
the stage's execution_summary.md, retaining required section headings. A file
path, check count, commit hash or "done" alone is insufficient. The summary may
trigger stage completion: write it only after the calling flow's gates and
collaboration cleanup allow completion. Report pending blockers in progress
updates or a draft artifact without a completion marker.

## Live acceptance report

- State the actual verdict, tested source/build identity and relevant environment.
  Disclose real services/agents versus stubs or test doubles.
- Include a compact table covering EVERY planned scenario: action, expected
  behavior, observed behavior, status and evidence link. Group related assertions;
  assertion totals are not scenario counts. Mark unexecuted scenarios NOT RUN
  with a reason. State counts only when recorded evidence supports them.
- Explain bugs found during acceptance, what was repaired and which scenarios
  passed after the repair. Distinguish earlier implementation from live-run fixes;
  explicitly say when no product changes were needed during acceptance.
- Preserve limitations, skipped/blocked/failed coverage, accepted exceptions and
  user overrides. NOT_APPLICABLE and overridden FAIL are different from PASS.
  Unit-test evidence does not establish a live exercise.
- Build the scenario table from the structured result's criterion records, not
  a second handwritten completion list. Preserve ACCEPTED_WITH_EXCEPTIONS and
  its scoped user authorizations; a waiver is not a passed observation.
- Link the result record and key logs/screenshots; report owned fixture/process
  cleanup and any unfinished temporary helpers with their task/wait IDs.

## Final delivery report

On every completion path, including declined or unnecessary merge, explain the
observable changes, summarize live scenarios/results, acceptance repairs, required
check outcomes and remaining limitations. Reuse the live report instead of
reconstructing unsupported claims. Preserve NOT RUN and overridden verdicts.

State actual commit/branch and merge outcome, and link the live report and key
evidence. Distinguish the source exercised live from later merge validation;
report affected acceptance reruns after material conflict resolutions when they
actually happened. Never claim an unexecuted scenario passed on merged code.

Include helper cleanup from earlier stage reports and your own reconciliation.
If a temporary helper still blocks run termination, identify it and the needed
action; stages being done does not prove the run exited. Do not cancel another
stage's helpers or idle standing writers just to finish the report.
