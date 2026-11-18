---
name: afm-dev-stage-verify
description: Checklists for the dev-spec AI verify step of the plan, implement, live-run and docs stages. Use when the flow's verify prompt names a stage section; not for helper reviews or implementation.
---

# dev-spec stage verify

Verify agents do not inherit stage skills. Before reviewing, read these files
from the same library (`$AFM_PIPELINE_DIR/skills/`):

- `afm-review-work/SKILL.md` and `afm-check-evidence/SKILL.md`;
- `delta-spec-contract/SKILL.md`;
- `afm-dev-escalation/SKILL.md` for the plan, implement and live-run sections;
- `afm-ui-acceptance/SKILL.md` only when project.json selects UI acceptance.

Use the injected verify result contract. Apply only the section the flow names;
it defines the scope. Stay read-only, report missing evidence truthfully and do
not demand wording polish, ceremonial requests to unselected roles or reviews
the risk policy did not select. A summary reply alone is not a result.

## Plan

Inspect `plan/dev-plan.md`, `project.json`, `approval.md`, `delta.md` and any
consultation evidence via the paths in the stage summary.

- Delta: check it against source behavior, material task decisions and the
  scenario/check mappings, or verify the reason for no delta.
- Fit: task fit, requirement/prototype coverage, real integration points,
  repo-required commands, justified review budget, executable live acceptance.
- Acceptance: interface selection, atomic criteria, justified UI mode/surfaces;
  no visual protocol for backend-only work, no blanket palette sweep for a
  local interaction fix.
- Scopes: input dependency coverage including build/configuration inputs;
  uncertain scopes use the whole tree. One owner per broad check; flag
  unjustified duplicate full suites or blanket stress/mutation passes.
- Consultations: selected ones have committed helper results with task/request
  IDs and dispositions; profile mappings and helper/check budgets fit.
- Escalation: apply the escalation skill's audit checklist to plan ownership and
  `review.escalation_profiles` bindings.
- Every plan section/task explains WHAT and WHY with real symbols/contracts and
  honest planned checks.
- C4: inspect c4.json, c4-manifest.json and the actual bound approval
  question/answer. Views describe the real affected scope at the named level,
  reference actual source and task IDs, and the exact generated presentation is
  in the question the human approved. Before/After reflects the plan, not a
  synthetic example. A skip_reason is valid only when no view would help.
  Question binding is evidence of presentation, not human approval.
- Planning mode: ordinary written planning needs no grooming choice, workshop,
  browser feedback or readiness. If grooming-choice.json exists, validate its
  actual AFM question/answer and respect the choice. For a requested/resumed
  workshop inspect grooming.json, grooming-checkpoint.json and
  grooming-approval.json: visual task IDs, sources and explanations match
  dev-plan.md, comments are answered in their own threads, and the exact
  displayed revision/plan/project bytes have explicit human AFM approval.

## Implement

Inspect the actual change against the approved plan, delta and project
contract, plus linked team-review and check evidence.

- Required task and scenario coverage; each changed file belongs to an approved task.
- The selected risk-based review policy ran; unselected reviewers are not missing work.
- UI selected: inspect `ui-preview.json`, actual observations and selected
  prototype/reference pairs. Backend-only work needs no previews.
- A baseline defect violating an approved criterion remains blocking;
  correctness defects remain blocking even if dismissed as out of scope.
- Temporary reviews/diagnoses have committed helper results and IDs; canonical
  request IDs have linked replies. Board completion does not prove a reply_to
  wait was answered. Recorded cancellations need accepted evidence and must not
  hide outstanding review work.
- Apply the escalation skill's audit checklist.

## Live-run

Inspect `live-run/result.json`, `execution_summary.md`, the approved live
scenario, actual observations and any team-progress.json/live-repair-review.md.

- The result describes the current inputs and contract. Inspect every criterion
  row, its evidence and input scope; unchanged criterion identities may reuse
  actual prior observations, never unexecuted steps.
- PASS needs all required criteria. NOT_APPLICABLE needs the reviewed
  `live.required: false` justification. WAIVED rows need their original scoped
  user authorization; ACCEPTED_WITH_EXCEPTIONS is not PASS.
- An explicit FAIL override: inspect the recorded failed/blocked steps and actual
  evidence without demanding a successful scenario. A verified override accepts
  its recorded failure, not missing or fabricated evidence.
- The report covers each planned scenario with observed outcomes and evidence,
  discloses test doubles and unexecuted coverage, separates live-run fixes from
  earlier implementation and makes no unsupported pass counts or claims.
- No repairs: do not demand repair artifacts or helpers. Repairs: inspect their
  diff, regression evidence, current declared checks and independent committed
  review of the repaired candidate; implement-stage approval predating them is
  insufficient. Apply the escalation skill's audit checklist and reject pending
  writer/reviewer work or acceptance defects hidden behind a summary.

## Docs

- The documentation diff matches actually implemented behavior and the
  project's requirements; required Docs notes are covered.
- No product code changed in this stage.
- Synced specs and archive match the accepted delta; deferred requirements, if
  any, are reported to the user as unpublished behavior.
- Report factual mismatches and missing required docs; wording taste is
  non-blocking. Reuse recorded docs build evidence for unchanged inputs.
