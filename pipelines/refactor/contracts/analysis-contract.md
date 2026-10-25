# Two-architect analysis contract

This contract applies to analysis artifacts only. Do not change target source,
configuration, dependencies or Git history. Read applicable project instructions.
The coordinator supplies absolute paths to the effective worktree, scope, brief,
source receipt, raw Strictacode reports and this toolkit. Your own AFM_STAGE_DIR
may belong to a team task: use the supplied ANALYZE_DIR for these deliverables.
Use the human's language. Do not access the managed browser during analysis.

Read ../bindings.json in this frozen toolkit. The independent reviewers are
`architect_a` and `architect_b`; their clients, models and reasoning settings are
configured per installation. Use your assigned role ID and its exact requested
model in reports and approvals. The coordinator manages messages and artifacts;
it does not replace either architect's analysis or signoff. A reported model is
not proof of execution identity; the coordinator also checks AFM participants.

## Independent pass

Inspect actual code, responsibilities, boundaries, imports, public contracts and
lifecycle. Strictacode is shared evidence, not the architecture model or a verdict.
Investigate counterexamples, deliberate tradeoffs and behavior-preservation risks.
Do not read the other architect's report or discuss conclusions until BOTH
independent reports are complete. A report with no findings is valid if justified;
missing coverage is unknown, not healthy.

Write only your assigned `<ANALYZE_DIR>/<reviewer>-findings.json`:

```json
{
  "schema_version": 2,
  "reviewer": "architect_a",
  "model": "COPY YOUR MODEL FROM bindings.json",
  "source": {"revision": "COPY RECEIPT", "fingerprint": "COPY RECEIPT"},
  "architecture_notes": "Responsibilities, boundaries and interactions observed in source",
  "limitations": ["Specific unverified areas and how to check them"],
  "findings": [{
    "id": "f-1",
    "title": "Concrete problem",
    "detail": "Observed behavior, impact, counterevidence and uncertainty",
    "evidence": "actual/path.go:10-35, symbol, inspected relationship",
    "priority": {"benefit": 4, "ease": 3, "reason": "Expected gain and why the change costs this much"},
    "candidate_changes": ["A bounded improvement and its alternative, preserved invariants, checks and risks"]
  }]
}
```

Use `reviewer: architect_b` and its configured model for the second report. Return its path,
source fingerprint and the scope actually inspected via `afm agent reply` to the
coordinator's request. Do not write execution_summary.md or finish the parent stage.

## Ranking rubric

Both final findings and final proposals carry `priority: {benefit, ease, reason}`.
These are ordinal architect estimates, not measured metrics or a promise of ROI.

- Benefit 5: fixes a demonstrated correctness/reliability hazard or a major goal
  blocker; 4: substantial repeated change/test cost or harmful coupling;
  3: a bounded maintainability gain; 2: preparatory/local clarity;
  1: cosmetic or weakly demonstrated benefit.
- Ease 5: local, small and easy to verify/revert; 4: a few files, known seams;
  3: several collaborators and regression checks; 2: broad contract/lifecycle
  migration; 1: large/high-risk migration with important unknowns.
- Explain scope, payoff, effort and risks in `reason`; don't average disagreements
  blindly. Rank by benefit descending, then ease descending; use a stable ID as
  a final tie-break. Dependencies define execution order separately from priority.
- Preparatory stages must state their own benefit and name the later payoff.
  A new file or abstraction alone does not establish a better architecture.

## Joint synthesis

After both reports exist, the coordinator authorizes architect_a to own the common
`architecture.json`, `consensus.json`, and `analysis.md`. architect_b reviews the same
packet and proposes concrete corrections. Only that designated merger edits the
common files; neither participant edits the other's independent report or approval.
Original reports remain intact for provenance. New issues found jointly go in
`joint_findings` with evidence; do not pretend they were independently discovered.

Deduplicate equivalent problems using source evidence, not matching titles. Check
all findings from both reports, alternative designs, risks, priorities and scope.
Keep useful disagreements visible: reject or defer unsupported claims with a
reason; retain genuinely incompatible solutions as explicit alternatives, not as
one contradictory plan. Consensus means both consider the shared recommendation
and the recorded exclusions valid; it does not mean erasing uncertainty.

Build architecture.json using the contract below and ../examples/example.json. Add priority
objects to every finding and proposal. Sort both arrays using the ranking rubric.
Keep compatible stages independently reviewable; validate each prerequisite closure.

Write consensus.json:

```json
{
  "schema_version": 2,
  "source_fingerprint": "COPY RECEIPT",
  "ranking_policy": "benefit_then_ease",
  "summary": "What the two architects agree is worth doing, and why",
  "dispositions": [{
    "reviewer": "architect_a", "finding_id": "f-1", "status": "accepted",
    "merged_finding_ids": ["shared-finding-id"],
    "reason": "Evidence supports it; duplicate of architect_b/f-2"
  }],
  "joint_findings": [],
  "open_questions": ["A nonblocking uncertainty and its verification"]
}
```

Include exactly one disposition for EVERY original finding, from BOTH reports.
Statuses: `accepted` maps to one or more real merged findings; `rejected` and
`deferred` have empty merged_finding_ids and a concrete reason. A jointly discovered
finding uses `{finding_id, reason, evidence}` in joint_findings. Every final finding
needs provenance. Unresolved blockers must not be relabeled nonblocking to pass.
analysis.md explains the architectural model, ranking, alternatives, omissions,
dispositions and expected benefits in plain language.

## Review and agreement

The coordinator freezes the packet and sends its exact hash to BOTH architects:

```sh
node "$TOOLKIT/scripts/consensus.cjs" digest --stage "$ANALYZE_DIR"
```

Inspect the frozen bindings and all five packet files: source.json, both independent reports,
architecture.json and consensus.json. Independently verify the complete merged
list, coverage of the original findings, scores/order, proposed graph changes,
verification steps, assumptions and exclusions. Do not approve just your own part.
Check source evidence again where claims conflict. The author must review the
final packet too; authoring it is not an approval.

Write only `<reviewer>-approval.json`:

```json
{
  "reviewer": "architect_a", "model": "COPY YOUR MODEL FROM bindings.json",
  "packet_sha256": "EXACT HASH RECOMPUTED FROM THE BINDINGS AND FIVE FILES",
  "verdict": "pass", "ranking_accepted": true,
  "finding_ids": ["ALL final finding IDs"],
  "proposal_ids": ["ALL final proposal IDs"],
  "blocking_issues": [],
  "rationale": "Specific evidence that the complete shared list and ranking are valid"
}
```

Otherwise use `verdict: needs_changes`, `ranking_accepted: false` and concrete
blocking_issues. Reply to the specific review request with the verdict, hash and
approval path. During a review batch nobody edits the packet. A change to any
packet file invalidates BOTH approvals; both review the new hash. Approval files
are consistency records, not cryptographic proof of an agent's identity: the
coordinator must also check the corresponding durable AFM replies and senders.
Do not approve to satisfy a retry budget. After two unsuccessful correction
rounds, return the unresolved points for human clarification; no workshop yet.

## Architecture document requirements
Build architecture.json using the exact contract in ../examples/example.json. Use this
run directory plus the source fingerprint as session_id; set revision=1,
addressed_event_id=0. Copy source.json revision and fingerprint into
source.revision and source.fingerprint and explain scope/exclusions in
source.limitations. Build baseline nodes and typed edges by inspecting actual
code, imports and configuration. A top-N report is NOT a full architecture
inventory. Cover the agreed components including unscored ones. The first
prototype uses a curated component graph; document that it is not a complete
call graph. Source locations and stable IDs must refer to actual code.

Groom the architecture model beyond analyzer output: describe the real
responsibilities, component boundaries and collaboration patterns. Explain
each node's responsibility in description, use parent for actual containment,
and keep navigation levels coherent. Do not present a directory inventory
as an architectural explanation. The diagram will show these boundaries
and the typed relations; evidence must explain what actually crosses them.
For each dependency, include `description` (its concrete purpose) and `symbols`
(an array of exact function/type/export names crossing the boundary) when the
source establishes them. Keep `evidence` with file/line references. Distinguish
importing a package from calling a function or exporting a symbol. Omit symbols
that were not established; do not invent a complete symbol inventory. For proposed
edges describe the target contract explicitly and retain inferred confidence until
implemented. Preserve edge IDs across versions when the same relation survives;
use remove/add for a different relation so the UI can compare changes accurately.

Read each hotspot before claiming a problem. An inferred dependency must
have confidence=inferred and explain why. Strictacode's internal type graph
is heuristic (e.g. Go resolves some types by name); do not label it confirmed
without checking source. Do not infer inter-service calls from folder names.

Propose a small useful set of independently reviewable refactoring stages.
Each needs rationale, exact affected components, concrete ordered steps,
verification, effort, risks, prerequisites and conflicting alternatives.
Explain the responsibility before and after each change, the expected
benefit and the complexity it introduces. A new file/package alone is not
an improvement; identify preparatory steps and avoid claiming their final
benefit before later stages are implemented and verified.
The selected proposal steps become the final plan verbatim: name the actual
files/symbols, preserved behavior, pre-change regression checks, completion
criteria and rollback considerations. Record unresolved decisions as risks.
Describe visual changes using add_nodes/remove_nodes/update_nodes/add_edges/
remove_edges. Each stage and its prerequisites must yield a valid graph;
explicitly remove dangling edges when deleting a node. Proposed nodes have
no measured metrics. Avoid gratuitous abstractions or a rewrite based on scores.
