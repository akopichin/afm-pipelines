---
name: delta-spec-contract
description: Derive an approved behavioral delta from the dev-spec plan, trace scenarios through implementation and acceptance, then sync and archive the delta.
---

# Delta spec contract

## Plan

Read the affected committed specs/<domain>/spec.md and targeted code and tests.
Develop the ordinary plan or requested grooming first. Derive plan/delta.md from
the settled behavior before the existing approval. Keep design choices, tasks,
owners and evidence in dev-plan.md. Add scenario IDs to its task and test entries.
A behavior-preserving change uses project.json spec.skip_reason and no delta.md.
A genuinely new domain may start with ADDED. If an existing requirement needed
for MODIFIED or REMOVED is undocumented, identify the gap using code and tests.
A reviewed, committed baseline must cover that requirement before the change.

Use the following shape, leaving unused operation sections empty. In an existing
domain, reuse stable requirement and retained scenario IDs. Use unique scenario
IDs across the delta. MODIFIED replaces the entire requirement, including its
retained scenarios. Put the before/after summary in the plan. REMOVED names the
existing requirement, states a Reason and describes the observable removal in
a scenario. IDs use uppercase letters/digits separated by hyphens. Domain names
are lowercase hyphenated slugs.

```markdown
# Change title

## ADDED

### Requirement: helper-lifecycle/HELPER-REQ-010 — Optional result validation
When validation is enabled, the engine publishes only accepted results.

#### Scenario: HELPER-SCN-010 — Accepted result is published
- GIVEN a completed helper turn with validation enabled
- WHEN validation accepts the result
- THEN the engine publishes the result and its linked answer

## MODIFIED

## REMOVED
```

Set project.json spec to {slug, delta_sha256, non_live}. Hash the exact delta
bytes with SHA-256 and use a short unique lowercase slug. Each live criterion
sets scenario and references that scenario's requirement. Map any remaining
scenario ID in non_live to a concrete planned check and the reason for using it.
Run the frozen helper's spec-plan before generating the approval presentation.
Include the full generated c4-approval.md in the same AFM question and retain
the existing question binding. A changed delta requires a new approval.

## Implement, review and accept

Give writers the approved delta path and their scenario IDs and planned checks.
Writers report task/scenario IDs, changed files and regression evidence. Internal
changes necessary for the approved design map to an approved task. Plan no-op
changes use the ordinary task and check evidence. Review the frozen candidate
against the approved delta, the current preflight receipt and relevant code/test evidence. Flag missing
scenarios, broken retained guarantees and work outside the approved plan.
Acceptance records actual observations for the existing criterion IDs. Use
project.json to link those results to the delta and report the scenario IDs.

## Docs, commit and merge

After accepted live-run, run spec-sync in Docs using the frozen helper. A failed or waived
mapped live criterion blocks spec publication until acceptance is resolved. It
applies the approved delta by requirement ID and writes the delta with a
sanitized acceptance summary under specs/archive/. Keep the originals in the
run directory for retries and audit. Include these files in the existing final
checks and commit. Run spec-verify after integration with the local base. If
the same requirement changed independently, reconcile through the existing
material-change approval path before publishing. Never silently widen the delta
to resolve a conflict.
