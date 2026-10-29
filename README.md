# AFM Pipelines

Reusable, self-contained workflows for [AFM](https://github.com/akopichin/afm).
Each package combines a flow definition with the scripts, agent instructions,
interfaces, examples, and tests it needs. Install a package into a project with
the catalog helper, then run it with AFM; the AFM engine does not need to be modified.

## Available pipelines

| Pipeline | Purpose | Status |
| --- | --- | --- |
| [Refactor](pipelines/refactor/README.md) | Analyze a codebase with two architects, explore changes in an interactive architecture workshop, and export approved, separately executable plans. | Initial portable package; plans changes but does not execute them. |
| [Dev pipeline](pipelines/dev-pipeline/README.md) | Plan and implement a project change with coordinated writers, selected reviews, real acceptance, documentation, commit and optional merge. | Portable package; executes approved changes. |

## Repository layout

```text
pipelines/
  dev-pipeline/
    pipeline.yaml          Package metadata and setup requirements
    flow.yaml              AFM entry point
    config.example.yaml    Default roles and Docker recipes
    scripts/               Evidence and live-app helper
    skills/                Planning, coordination, writer and review rules
    docs/                  Project contract
    tests/                 Helper regression checks (catalog only)
  refactor/
    pipeline.yaml          Package metadata and setup requirements
    flow.yaml              AFM entry point
    config.example.yaml    Model commands and AFM team profiles
    scripts/               Runtime helpers and build tools
    ui/                    Interface sources and prebuilt graphics bundle
    skills/                Package-local agent instructions
    contracts/             Analysis and approval contracts
    examples/              Synthetic sample data
    tests/                 Package, model, layout, and browser checks
    docs/                  Detailed usage documentation
```

Packages live in this catalog and are installed under `pipelines/<name>/` in the
target project. Refactor freezes its complete toolkit into each run. Dev-pipeline
freezes its helper and flow in bootstrap, while AFM reads its skill library again
on later agent turns. Do not update that library during an active dev-pipeline run.

## Getting started

Install and configure AFM first. Then follow the chosen package's README for
its environment, model, and authentication requirements. The refactor package
includes a prebuilt interface; users do not need to build its frontend.

The bundled AFM skill `afm-pipelines` can guide installation: ask your agent to
"install dev-pipeline in this project" or choose refactor. Its helper is shipped
here and can also be used directly from a catalog checkout:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/pipelines.mjs list
node scripts/pipelines.mjs inspect --project /absolute/path/to/your-project
node scripts/pipelines.mjs plan dev-pipeline \
  --project /absolute/path/to/your-project --out /absolute/path/to/install-plan.json
node scripts/pipelines.mjs apply /absolute/path/to/install-plan.json
node scripts/pipelines.mjs verify dev-pipeline --project /absolute/path/to/your-project
```

Review the printed plan before applying it. Use `--options options.json` to
choose each role's models/profiles and optional project skills. The helper
preserves unrelated configuration, creates isolated profiles, backs up changes,
and validates the installed flow. It supports updates, removal and interrupted
transaction recovery. It does not start a paid model run or install Docker and
provider clients automatically.

See [installation and options](docs/installer.md) for the complete procedure,
including cloning an immutable catalog revision, authentication requirements,
worktrees and limitations. The first adapters target Claude/Codex Docker recipes.
[Model bindings](docs/model-bindings.md) describe how each pipeline keeps its
own settings and freezes them into runs. AFM itself does not read `pipeline.yaml`.

## Development

The installer needs Node.js 22+. Package runtime helpers need Node.js 18+.
Maintainer checks need Node.js 22+, npm, and
an AFM binary; browser checks also need Chrome.

```sh
npm ci
npm test
python3 -B -m unittest discover -s pipelines/dev-pipeline/tests -p 'test_*.py'
cd pipelines/refactor
npm ci
npm test
npm run test:browser
```

Keep packages self-contained. Do not depend on another checkout, personal skill
directories, stored credentials, or sample data copied from a real private run.
Document behavior in English and ship the licenses for bundled dependencies.
The refactor package's build command regenerates its checked-in graphics bundle.

## License

Repository code is MIT-licensed. Bundled third-party code retains its own
licenses; see each package's license notices.
