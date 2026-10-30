# Dev pipeline

A project-aware AFM workflow that plans a requested change, coordinates three
standing writers and selected read-only specialists, runs declared checks,
exercises the real product, updates documentation, commits, and optionally merges
after a separate user approval. The flow speaks to the user in Russian and follows
the target project's own instructions, test commands, documentation language and
commit conventions.

## Requirements

- AFM with worktrees, team agents, script stages, interactive stages, and merged
  stage/team `skills` and `skills_dir` support. Tested with AFM 2.0.4; AFM 2.0.2
  predates the required skill loading support.
- Git and Python 3.9+ in the execution environment. The installer itself needs
  Node.js 22+ and Git.
- Docker and authenticated Claude/Codex clients for the generated default recipes.
  Model names are recommendations and can be changed per role at installation.
- A browser-capable coordinator for tasks whose approved live scenario needs a
  UI. The flow also supports CLI, API, library and documentation tasks.

The package includes all seven local skills, their reference files, the helper and
its project contract. Planning uses `afm-dev-planning`; it does not require the
external Superpowers plugin. Skills assigned to stages and standing writers are
loaded from the package. Temporary reviewers and verify agents receive exact
skill file paths because they do not inherit the stage's skill list.

## Install

Use the catalog's [installer](../../docs/installer.md) or the bundled
`afm-pipelines` skill. From a catalog checkout:

```sh
node scripts/pipelines.mjs list
node scripts/pipelines.mjs inspect --project /absolute/project/root
node scripts/pipelines.mjs plan dev-pipeline --project /absolute/project/root --out /private/dev-install-plan.json
node scripts/pipelines.mjs apply /private/dev-install-plan.json
node scripts/pipelines.mjs verify dev-pipeline --project /absolute/project/root
```

Use `--options /private/options.json` with `plan` to choose `settings`, optional
`skills` discovery copies, and per-role `client`, `model`, `reasoning` or a
compatible `profile` to copy. The 14 roles cover the three writers, stage
coordinators, AI verifier and seven specialist perspectives. A specialist remains
available for on-demand use without becoming a standing team member.

The recommended planner (`coordinator_plan`) is Claude Opus 5.5 with `xhigh`
reasoning. Its independent AI verifier uses Codex. Existing installations retain
their saved role choices on update; to switch an earlier Codex planner, pass:

```json
{"roles":{"coordinator_plan":{"client":"claude","model":"claude-opus-5-5","reasoning":"xhigh"}}}
```

The difficult-task writer (`writer_astra`, team ID `astra`) also uses Claude Opus
5.5 with `xhigh` reasoning; the stable role and team IDs are retained for existing
installations. Correctness review (`review_correctness`) uses GPT-6.1 Sol with
`xhigh` reasoning. To apply these defaults to an existing installation, pass:

```json
{"roles":{"writer_astra":{"client":"claude","model":"claude-opus-5-5","reasoning":"xhigh"},"review_correctness":{"client":"codex","model":"gpt-6.1-sol","reasoning":"xhigh"}}}
```

The installer writes `pipelines/dev-pipeline/` and isolated AFM profiles in the
project, binds all stage commands and reviewer profile names, and resolves the
package skill library to the main checkout's absolute path. That makes the
library available in linked worktrees, including when the package is not yet
committed. The read-only memory path points to the main checkout's `.memory`;
missing memory simply contributes no lessons. The installer does not run a paid
model probe or launch the flow.

From the target project, after reviewing the plan and configuring provider login:

```sh
AFM_COLLABORATION=1 AFM_BROWSER=1 AFM_USE_DOCKER=1 afm run pipelines/dev-pipeline/flow.yaml \
  --worktree dev-pipeline --port 3434 --idle-timeout 24h
```

The first interactive stage confirms the task if one was not already supplied.
For worktree runs, commit the installed package and any required project files
before starting work that needs them in the new worktree. The bootstrap can read
an uncommitted package from the main checkout, but the resulting product change
still follows the target project's Git and review rules.

## Behavior and evidence

Stages run in order: `bootstrap → plan → implement → live-run → docs → commit →
merge`. The approved plan and `project.json` contract live under the run's
`plan/` stage. The helper is copied to `bootstrap/helper.py` and rebound for
subsequent stages; each check receipt includes the source fingerprint, contract
hash, environment identity, command result and log path. See
[project contract](docs/project-contract.md) for the fields and gates.

Acceptance routes by observable behavior: backend-only API/CLI/library changes
use no visual protocol; UI tasks select behavior, visual or prototype mode with
bounded affected surfaces. Only those tasks load `afm-ui-acceptance`. Coordinators
capture early UI previews during implementation; UX/design helpers are selected
on demand. Structured criterion results make omitted steps and stale evidence
blocking before AI verification. Scoped user exceptions are reported separately
from PASS. See the project contract for schema version 2 and examples.

Declare rewriting generators/builds as `prepare` commands before broad checks,
inspect their changes, and freeze the candidate for review. Optional reviewed input
scopes allow receipts/live observations to survive unrelated edits; final checks
always cover the complete tree. Each attempt preserves its logs and prior receipt.

The live stage records actual product observations. In-scope failures trigger a
bounded repair and independent review cycle. A failed live scenario can proceed
only after an explicit user override of the recorded failure. The commit stage
runs final checks; merge is optional and has its own concrete approval. Neither
stage pushes. Existing runs keep their frozen helper and chosen profiles, and reference content-hashed immutable skill libraries. Updates retain the old
libraries (including legacy paths) for active runs. Never edit a retained library
in place; removal still requires stopping runs using the package.

## Package checks

```sh
python3 -B -m unittest discover -s pipelines/dev-pipeline/tests -p 'test_*.py'
node --test tests/installer.test.mjs
```

The installer test covers a project path containing spaces, resolved roles and
skills, actual AFM flow validation, update, and removal.

## Older local entry point

For an existing project using `pipelines/dev-pipeline-v1.yaml`, synchronize its
ignored local files from this catalog while keeping its configured stage, writer
and specialist model choices:

```sh
node scripts/sync-dev-pipeline-v1.mjs /absolute/project/root
```

This writes the local flow, helper, helper tests and contract, and a new immutable
skill library under `pipelines/skill-libraries/`. It preserves older libraries
and does not change active run snapshots or launch a run. New runs use the updated
entry point. Use the installer for the normal managed `dev-pipeline` package.
