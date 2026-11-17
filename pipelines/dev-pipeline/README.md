# dev-pipeline v2

Requires AFM 3.1.4+. This is a manifest-v2 package; no installation is needed.

```sh
afm pipelines inspect github.com/akopichin/afm-pipelines//pipelines/dev-pipeline@v2.0.2
afm run --pipeline github.com/akopichin/afm-pipelines//pipelines/dev-pipeline@v2.0.2 \
  --worktree my-dev-pipeline --idle-timeout 24h
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
