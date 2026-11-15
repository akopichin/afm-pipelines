# AFM Pipelines v2

Reusable workflow packages for AFM 3.1.4 or later. Run packages directly from
Git or a local checkout; no catalog installer, npm install or project copies
are needed. AFM resolves the Git revision, caches an immutable snapshot and
assembles recipes/profiles in memory without editing your configuration.

| Package | Purpose |
| --- | --- |
| [dev-pipeline](pipelines/dev-pipeline/README.md) | Plan, implement, review, exercise, document and commit a project change. |
| [review](pipelines/review/README.md) | Five independent review perspectives, deduplicated findings and a ranked report. |
| [refactor](pipelines/refactor/README.md) | Two-architect analysis and a user-approved architecture workshop; does not implement changes. |

```sh
afm pipelines inspect github.com/akopichin/afm-pipelines//pipelines/dev-pipeline@v2.0.1
afm run --pipeline github.com/akopichin/afm-pipelines//pipelines/dev-pipeline@v2.0.1 \
  --worktree my-change --pipeline-options ./pipeline-options.yaml
```

Omit `--pipeline-options` to use package defaults. Use the same command to resume.
Choose a new worktree name for a new development task. The review package uses
the current checkout; omit `--worktree` when reviewing uncommitted changes.
A tag or full commit makes the source reproducible. Local development works with `--pipeline ./pipelines/dev-pipeline`.

Configure Docker, `docker.autoShim`, collaboration, browser access and provider
authentication in AFM before running. Package requirements report missing setup;
packages cannot change your Docker image, mounts or global settings. Native host
execution does not provide the same read-only guarantees as Docker.

See [running and migration](docs/installer.md) and [role settings](docs/model-bindings.md).
Packages contain their flow, `agents.yaml`, skills, scripts, UI and contracts.
Model overrides replace complete recipe records, so include `auth` for Claude.
No provider calls are made by `inspect`.

## Development

Node.js 22+, Python 3.9+, AFM 3.1.4+ and Chrome for browser checks:

```sh
npm ci
npm test
python3 -B -m unittest discover -s pipelines/dev-pipeline/tests -p 'test_*.py'
npm run test:planning-browser
cd pipelines/refactor
npm ci
npm test
npm run test:browser
```

`AFM_BIN` selects the executable for integration checks. Rebuild bundled C4
assets with `npm run build:c4`. Keep packages self-contained, include third-party
licenses, and exclude tests/build dependencies from runtime resources.

## License

MIT; bundled third-party components retain their own licenses.
