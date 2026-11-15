# Run packages and migrate from v1

Requires AFM 3.1.4+. The catalog v2 uses AFM manifest schema 2; v1 installer
manifests cannot be loaded by `afm run --pipeline`.

```sh
afm pipelines inspect github.com/akopichin/afm-pipelines//pipelines/refactor@v2.0.0
afm run --pipeline github.com/akopichin/afm-pipelines//pipelines/refactor@v2.0.0 \
  --worktree architecture --idle-timeout 24h
```

Set up Docker, autoShim, collaboration, managed browser and provider login in
AFM first. These are host/project settings, outside package options. Refactor
also needs strictacode; its scope helper retains the existing isolated setup.
Inspect reports requirements but never installs tools or tests paid access.

## Customize roles

Use YAML with `docker.agents` and/or `collaboration.profiles`, as documented in
[role settings](model-bindings.md). Options are reapplied on each start and are
not copied into project configuration. Keep them outside the package snapshot.
A later layer replaces an entire recipe/profile, not individual fields.

## Continue and update

Repeat the original command to continue its recorded package snapshot, even if
the catalog changed. Use a new worktree/run name to start another version.
Changing the client of a saved interactive session can lose compatibility;
changing a saved team/helper recipe makes AFM reject its next turn with
`executor_changed`. Keep active team recipes stable or start a new run.

## Migrate an installed v1 package

1. Finish or stop old runs. Keep their installed packages, generated profiles,
   skill libraries, receipts and snapshots while they may still be resumed.
2. Read the effective role settings in the old `bindings.json` and copy the
   desired complete recipes/profiles to a new options YAML, using v2 names from
   `afm pipelines inspect`. The new names begin with `dev-pipeline-` or `refactor-`.
   JSON installer options and generated v1 profile names are not v2 options.
3. Inspect the v2 package with the options, then start a **new** worktree/run.
   There is no automatic conversion of active runs or their approvals.
4. After old runs are retired, review and remove only the old package files and
   generated profiles that no remaining run uses. Preserve project configuration,
   credentials, artifacts and shared skills. V2 does not need receipts or backups.

No v2 install/remove transaction exists: AFM owns fetching, caching, snapshots
and resume bindings. The v1 installer remains available in Git history for old
installations; it is not part of the v2 runtime.
