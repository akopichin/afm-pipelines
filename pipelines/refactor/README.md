# refactor v2

Requires AFM 3.1.4+. This is a manifest-v2 package; no installation is needed.

```sh
afm pipelines inspect github.com/akopichin/afm-pipelines//pipelines/refactor@v2.0.0
afm run --pipeline github.com/akopichin/afm-pipelines//pipelines/refactor@v2.0.0 \
  --worktree my-refactor --idle-timeout 24h
```

Add `--pipeline-options /absolute/path/options.yaml` for role settings. See
[setup and v1 migration](../../docs/installer.md) and
[roles and approval identities](../../docs/model-bindings.md).
Package files live in the immutable `AFM_PIPELINE_DIR` snapshot; project paths
and worktrees still refer to your application. Configure Docker autoShim,
collaboration, managed browser and provider credentials in AFM first.

Two independent architects analyze source, reconcile findings and approve one
complete packet before the interactive workshop. It produces refactoring plans
and does not execute them. The scope step prepares strictacode and a per-run
artifact toolkit. See [workshop protocol](docs/workshop.md) and
[analysis contract](contracts/analysis-contract.md). Node 18+, Git and a managed
browser are required. UI assets are prebuilt; no runtime npm install is needed.
