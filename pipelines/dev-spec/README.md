# dev-spec v2

Requires AFM 3.1.4+. This is a manifest-v2 package; no installation is needed.

```sh
afm pipelines inspect github.com/akopichin/afm-pipelines//pipelines/dev-spec@v2.1.0
afm run --pipeline github.com/akopichin/afm-pipelines//pipelines/dev-spec@v2.1.0 \
  --worktree my-dev-spec --idle-timeout 24h
```

Add `--pipeline-options /absolute/path/options.yaml` for role settings. See
[setup and v1 migration](../../docs/installer.md) and
[roles and approval identities](../../docs/model-bindings.md).
Package files live in the immutable `AFM_PIPELINE_DIR` snapshot; project paths
and worktrees still refer to your application. Configure Docker autoShim,
collaboration, managed browser and provider credentials in AFM first.

The stages plan and approve a project contract, implement using standing writers,
verify independently, exercise real acceptance criteria, update documentation,
commit and optionally merge. Evidence rules are in [project contract](docs/project-contract.md).
C4 approval images and optional visual planning are bundled under `planning/`.
Python 3.9+ and Node 18+ are runtime requirements. Use the YAML presets in
`examples/` to customize full recipes. Existing source, approval and evidence
gates remain mandatory.

## Specification workflow

- **Plan or groom** the task as usual. The refinement skill clarifies expected
  behavior and asks only material questions the repository cannot answer. The
  plan stage derives a behavioral delta and presents it in the same approval.
- **Implement and review** using the approved tasks, delta and scenario IDs.
  A short project-specific preflight runs before product cross-review. Full tests
  run at the existing gates.
- **Live acceptance** records observations against approved criteria, which link
  back to their delta scenarios.
- **Docs, commit and optional merge** apply and archive the accepted delta.
  Commit includes the canonical specs and archive. Merge checks the result
  again against independently edited requirements on the current local base.

Existing behavior belongs under `specs/<domain>/spec.md` in the target
repository. Commit a baseline for affected existing requirements before running
a modifying or removing change. New behavior can seed a domain with ADDED.
Behavior-preserving work includes a short reason in the plan. See
[the delta contract](skills/delta-spec-contract/SKILL.md).

Repeated failures escalate to Астра for diagnosis, then Опусарх implements the
accepted design. Фабула (Claude Fable 5.1, `medium`) stays idle on the first
escalation and its first rejected candidate. Activate it only after at least TWO
distinct post-escalation candidate rounds for the same logical task require
corrections. It independently verifies Astra's diagnosis, repeated findings and
corrective design. Only then may the coordinator give it one bounded residual
repair with understood causes, exclusive file/test ownership and fresh independent
acceptance. The first rescue rejection requires a user decision before another
bounded attempt; further failure or material redesign also requires a decision.
Counters survive stage changes and resumes. The
[handoff protocol](skills/afm-dev-coordinator/references/diagnosis.md) defines the
evidence and ownership rules. Existing runs retain their frozen snapshots.

Coordinators check delegated work every five minutes of waiting, even when an
assignment has a one-hour budget. Wait windows are capped at 300 seconds while
the absolute task deadline stays separate. Each wake checks status, results and
recent granted logs/activity. Confirmed failed agents can be replaced before the
task deadline, after proving the previous writer and its modifying commands have
stopped. Silence alone does not establish a hang; missing stop/replacement access
is reported immediately. See [health checks](skills/afm-dev-coordinator/references/health.md).
