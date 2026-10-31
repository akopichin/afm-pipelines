# Development project contract

The plan stage writes `dev-plan.md` and `project.json` under its absolute stage
path. New plans use `schema_version: 2`. Frozen helpers for existing runs retain
their old contract; the new helper also reads version 1 without the new gates.
Keep requirements and decisions in the plan and reference shared skill protocols.

## Execution and evidence

Required fields: `base_branch`, `environment_id`, `input_paths`, `checks`, `live`,
`acceptance` and `review`. Review selection, role mappings, escalation profiles
and budgets retain their existing flow-defined format.

- `environment_id` identifies the actual toolchain/dependency environment. A
  receipt may be reused only after confirming the environment is unchanged.
- Top-level `input_paths` includes relevant ignored inputs; all tracked and
  nonignored untracked files are included by default. Run artifacts are excluded.
- `checks` has `implement`, `docs` and `final` groups. Each has `commands`, an
  array of `{argv, cwd?, timeout?, input_paths?}`. Empty commands require `skip_reason`. Commands
  use argument arrays; shell pipelines explicitly use `bash -o pipefail -c`.
- A group's optional `prepare` array uses the same command format for generators,
  formatters or builds that rewrite outputs. Run `helper prepare --group GROUP
  --stage STAGE`, inspect changes and freeze/review the generated candidate before
  checks. Preparation has its own receipt and is not a passed test. The checks
  gate requires current preparation when declared; unexpected check-generated
  changes still invalidate the result. Preserve required build/test commands.
- Optional `input_paths` on an implement/docs command or group, `live`, or a criterion scopes
  its fingerprint to project-relative files/directories. Top-level ignored inputs
  remain included. The selection must cover the complete dependency closure,
  including config, templates, shared code and build inputs. Review its rationale;
  omit it when uncertain. No parent traversal or empty scopes. Final checks always
  fingerprint the whole tree. File deletion, new files in selected directories,
  contract changes and environment changes invalidate matching evidence.
  A command scope overrides its group scope and must remain within the group's
  dependency coverage. Prefer separate command scopes for independent backend/UI
  checks; do not narrow scopes to hide a failed check.
- `live` has `required` and `reason`; optional `input_paths` identifies all product
  inputs. A docs-only/non-executable change can set required false with no live
  criteria. Required project tests/builds still run.

`helper identity` prints the whole source identity. `identity --live` uses the
live product scope; `identity --criterion ID` uses that criterion's input scope,
falling back to live scope and then the whole tree. Copy the actual returned
`tree`, `contract_sha256`, `environment_id`; HEAD alone is insufficient.
`identity --criteria` returns an ID-to-identity map for all criteria in one operation.
It and `live-gate` hash each distinct scope once, then recheck stability before
returning. This cache lives only for that invocation; subsequent invocations read
current content, including uncommitted edits. Branch names are not cache keys.

Checks retain each attempt's command logs and archive replaced receipts. The
helper does not prove that a chosen input scope is complete or an observation is
truthful: independent review remains responsible for those semantic checks.

Implement/docs checks reuse individual successful command results automatically
within the same run, stage and group. The key includes the complete declared input
content, command specification (including timeout and working directory), contract
hash and environment identity. Original logs must still exist. Commands that failed
or changed their inputs are not cached; successful prefixes survive a later command's
failure. The group still checks input stability before accepting its new receipt.
Final checks do not use this per-command cache; explicit reuse of a complete matching
final receipt remains available. Confirm the toolchain/environment before reuse.
Use `checks --fresh` only for an explicitly budgeted diagnostic rerun: it bypasses
both command caching and `--reuse`, preserving the earlier logs.

## Acceptance routing

Select by changed observable behavior, not source language or repository stack.
Mixed tasks combine interfaces. A backend change can require a UI journey; an
interaction fix does not automatically require prototype/theme sweeps.

```json
{
  "interfaces": ["api"],
  "reason": "Only the command API changes",
  "ui": {"mode": "none", "reason": "No UI behavior changes"},
  "criteria": [{
    "id": "L1", "requirement": "R1", "interface": "api",
    "action": "Send the same command twice concurrently",
    "expected": "Exactly one job starts",
    "evidence_kind": "network"
  }]
}
```

Place this object in `acceptance`. Interfaces: `api`, `cli`, `library`, `ui`,
`docs`. Set UI mode to `none`, `behavior`, `visual` or `prototype`, with a reason.
For non-none modes also list concrete `surfaces`, such as `People drawer at 390`
and `wide People panel after toggle`. Prototype mode includes approved `references`
paths. Declare any ignored reference inputs in the top-level input fingerprint or
preserve immutable reference copies/hashes for review.

Only participants assigned UI work read `afm-ui-acceptance`. Backend-only work
requires neither UI previews nor visual reviewers. Select UX/design helpers for
actual uncertainty or visual risk, not as standing participants. The UI skill
bounds widths/themes/states to the affected behavior and specifies early previews.
`ui-gate` requires `implement/ui-preview.json` for selected UI surfaces before
implementation completes; it is a no-op for backend-only work.

Each live criterion has a unique stable `id`, `requirement`, selected `interface`,
`action`, `expected`, and `evidence_kind`: `observation`, `network`, `screenshot` or
`measurement`. Use atomic criteria: separately required dimensions/actions need
separate IDs. Specifying network evidence means the actual response/status must
be captured; opening a dialog is not submitting it. A baseline bug violating an
explicit criterion is still blocking. Non-executable tasks use an empty list.

## Structured live result

`live-run/result.json` includes the identity from `identity --live`, `verdict`,
`decision`, `reason`, overall `evidence`, `criteria`, `repairs` and `pending_work`.
Each criterion appears exactly once, with its own `identity --criterion ID` and:

```json
{
  "id": "L1", "status": "PASS",
  "observed": "Both responses were captured; only one job was created",
  "evidence_kind": "network", "evidence": ["round1/L1-network.json"]
}
```

Evidence paths may be relative to the stage or absolute. Every referenced file
must exist. Actual observations and matching identity are required per criterion;
changing only the overall result identity cannot refresh older observations.
Unchanged criterion input identities allow reuse of actual observations. Unknown
impact requires repeating the full scenario. Unit tests cannot replace required
live observations. AI verify checks content, fidelity and declared scope.

`repairs` is empty when no repairs occurred. Otherwise each entry has `id`, the
underlying `invariant`, `status: accepted`, and nonempty `review_evidence` and
`regression_evidence` file lists. Use the coordination ledger for repair counts,
request/result IDs and dispositions. `pending_work` must be an empty list before
completion; unfinished repairs/reviews cannot be hidden by a report.

- `PASS` with `decision: continue` requires all criteria to pass.
- A scoped user exception uses criterion `status: WAIVED`, `reason` and
  `authorization_file` pointing to the original user instruction. Preserve the
  observation/evidence and affected criterion ID. Overall verdict must be
  `ACCEPTED_WITH_EXCEPTIONS`, decision continue. Verify checks the actual user
  authorization and scope; arbitrary files do not establish permission. A direct,
  unambiguous instruction needs no second ceremonial confirmation.
- `FAIL` with `decision: retry` blocks. A recorded failed criterion may proceed
  through the flow's explicit dialog override only: `answer_file` must point to
  the exact selected override for the current overall tree and contract. Missing
  or NOT_RUN required evidence cannot be overridden as a successful exercise.
- `NOT_APPLICABLE`, decision continue is valid only for live.required false.

Generate the delivery scenario table from these records, retaining failures and
exceptions. `live-gate` checks completeness/identity; AI verify checks whether the
actual observations support the criterion and any scoped exception.

## Runtime library

Bootstrap freezes the helper and flow. Installed flows reference a content-hashed
skill library; updates retain older libraries, including legacy `skills/` paths,
so active runs keep their instructions. Do not edit those retained libraries.
Temporary helpers/verify agents receive exact review/evidence skill paths because
they do not inherit stage skills. Removal still requires stopping package users.
