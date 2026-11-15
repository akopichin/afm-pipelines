# dev-pipeline v2

Requires AFM 3.1.4+. This is a manifest-v2 package; no installation is needed.

```sh
afm pipelines inspect github.com/akopichin/afm-pipelines//pipelines/dev-pipeline@v2.0.0
afm run --pipeline github.com/akopichin/afm-pipelines//pipelines/dev-pipeline@v2.0.0 \
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
