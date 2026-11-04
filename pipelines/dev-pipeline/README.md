# Dev pipeline

A project-aware AFM workflow that plans a requested change, coordinates two
ordinary writers, an escalation-only reserve and selected read-only specialists, runs declared checks,
exercises the real product, updates documentation, commits, and optionally merges
after a separate user approval. The flow speaks to the user in Russian and follows
the target project's own instructions, test commands, documentation language and
commit conventions.

## Requirements

- AFM 2.2.2 with readable executor names, worktrees, team agents, script stages,
  interactive stages, and stage/team `skills` and `skills_dir` support.
- Git, Python 3.9+ and Node.js 18+ in the execution environment. The installer itself needs
  Node.js 22+ and Git.
- Docker and authenticated Claude/Codex clients for the generated default recipes.
  Model names are recommendations and can be changed per role at installation.
- A browser-capable planning coordinator when visual grooming is selected,
  including CLI, API, library and documentation tasks. Ordinary planning needs
  no workshop browser. Product UI acceptance is selected separately from planning
  and still depends on the actual changed behavior.

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
compatible `profile` to copy. The nine installed roles cover three writers,
three stage coordinators, the AI verifier, an architect and a UX consultant.
The backend and frontend team members are named **ЛинусБи** and **ЛинусФи**;
their declaration IDs remain
`dev-backend` and `dev-frontend`.

The backend/frontend writers and the work/documentation coordinators use Claude
Sonnet 5.5 with `medium` reasoning by default. Existing installations keep saved
role choices; override `reasoning` for those roles when updating to change them.

For architecture and UX consultations the installer first looks for matching
global/project AFM profiles backed by Claude Opus 5.5 with `xhigh` reasoning.
It copies compatible connection settings into isolated consultation profiles with
the package's bounded read-only instructions. When none match, it creates those
profiles from the built-in defaults. An explicit per-role `profile` choice still
copies that profile and its instructions. Independent correctness,
design, tests and security reviews reuse the installed verifier profile, so they
use the same executor and settings as AI verify: GPT-6.1 Sol with `xhigh` by default.
The planner records selected profile IDs and relevant escalation profiles in the
project contract.

Installed profiles and executor labels include each role's personal name, selected
model and reasoning. Team titles use the short names for mentions. Custom model
choices are reflected in the generated labels.

The recommended planner (`coordinator_plan`) is Claude Opus 5.5 with `xhigh`
reasoning. Its independent AI verifier uses GPT-6.1 Sol with `xhigh` through Codex.
Existing installations retain their saved role choices on update; to switch an
earlier Codex planner, pass:

```json
{"roles":{"coordinator_plan":{"client":"claude","model":"claude-opus-5-5","reasoning":"xhigh"}}}
```

To update an existing verifier and its shared review executor, pass:

```json
{"roles":{"verifier":{"client":"codex","model":"gpt-6.1-sol","reasoning":"xhigh"}}}
```

The reserve writer **ЛинусХ** uses Claude Sonnet 5.5 with `xhigh` reasoning.
The historical role ID `writer_opus`, team ID `opus` and profile/command keys stay
unchanged for installation compatibility; updates still migrate `writer_astra`
choices. Existing saved models are preserved, so explicitly override this role
to replace an installed Opus writer:

```json
{"roles":{"writer_opus":{"client":"claude","model":"claude-sonnet-5-5","reasoning":"xhigh"}}}
```

**Updating an existing installation to these Sonnet settings:** changing the
catalog defaults alone does not replace saved models or reasoning. A plain
`plan` without options can keep the old Opus writer and Sonnet `high` settings.
When applying this migration, run from the catalog checkout:

```sh
node scripts/pipelines.mjs plan dev-pipeline \
  --project /absolute/project/root \
  --options pipelines/dev-pipeline/examples/sonnet-writers.options.json \
  --out /private/dev-install-plan.json
```

Before `apply`, inspect the printed plan: `writer_backend`, `writer_frontend`,
`coordinator_work` and `coordinator_docs` must use Sonnet 5.5 `medium`;
`writer_opus` (ЛинусХ) must use Sonnet 5.5 `xhigh`. Other role choices remain
unchanged. Older Opus profiles can remain in AFM configuration for existing
runs; check the new role bindings rather than the mere presence of old profiles.

All initial sections and first repairs go to the ordinary backend/frontend
writers. The reserve receives a bounded correction only after two unsuccessful
repairs or a second rejection of the same defect and an independent diagnosis,
or an explicit user handoff. Complexity or subsystem boundaries alone do not
qualify. Before dispatch the coordinator records the trigger, evidence, prior
repair counts, required diagnosis, previous owner's release, file/test grant and
acceptance budget in the task ledger. The reserve checks that record before
editing; independent acceptance remains required. If the bounded rescue fails,
the coordinator asks the user instead of starting another rescue loop.

The installer writes `pipelines/dev-pipeline/` and isolated AFM profiles in the
project, binds all stage commands and standing writers, and resolves the
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

The planning agent first asks **Использовать визуальный груминг при планировании?**
Choosing **Да, использовать визуальный груминг** opens the architecture workshop
and shows its URL while the design is being discussed. Choosing **Нет, обычный
план** keeps the ordinary written plan, AFM discussion and single plan approval;
it requires no visual artifacts, browser feedback or page readiness. The choice
is saved in `plan/grooming-choice.json` and reused on resume. It does not change
the task's product UI acceptance requirements.

When enabled, Before/After panes compare the current step with its predecessor or
with the initial source snapshot. Previously proposed changes become neutral;
additions, modifications and removals use Graphite/Goga semantic colors, plus
symbols and dashed borders. Dark/light mode follows the selected AFM theme and
can be changed in the page.

Every step always displays **What changes** and **Why**. Technical tabs provide
real functions and signatures, contract changes, preserved invariants, source
references and planned checks with expected observations. Each technical entry
has its own What/Why; inapplicable categories explain their omission.

The discussion panel accepts comments about the whole plan, an individual step,
or a selected function, contract, check, component or relation. The actual
planning agent reads these events through managed-browser CDP, replies in the
original thread, and publishes coordinated plan/diagram revisions. The interface
does not generate synthetic answers. Drafts and comments survive step changes;
saved checkpoints recover them across AFM restarts and browser-profile loss.

**Перейти к утверждению** means the human is ready for the normal AFM plan dialog;
it does not approve implementation. Pending comments and unsent drafts block
that transition. The coordinator locks the exact displayed revision, obtains one
explicit human AFM approval, and seals hashes of the plan, project contract,
checkpoint and dialog evidence. Source drift or changed artifacts invalidate the
seal. See the [workshop protocol](planning/README.md) and
[synthetic example](planning/example.json). Do not use that sample as project facts.

Stages run in order: `bootstrap → plan → implement → live-run → docs → commit →
merge`. The approved plan and `project.json` contract live under the run's
`plan/` stage. The helper is copied to `bootstrap/helper.py` and rebound for
subsequent stages; each check receipt includes the source fingerprint, contract
hash, environment identity, command result and log path. See
[project contract](docs/project-contract.md) for the fields and gates.

The complete planning toolkit is frozen at `bootstrap/planning/`. The plan stage
keeps `grooming-choice.json` and, when enabled, `grooming.json`,
`grooming-checkpoint.json`, `grooming-approval.json` and the portable `report.html`.
Updates preserve existing toolkit snapshots. Only the
coordinator gets the managed browser; helpers and verify agents remain read-only.

Acceptance routes by observable behavior: backend-only API/CLI/library changes
use no product UI acceptance protocol; UI tasks select behavior, visual or prototype mode with
bounded affected surfaces. Only those tasks load `afm-ui-acceptance`. Coordinators
capture early UI previews during implementation; UX/design helpers are selected
on demand. Structured criterion results make omitted steps and stale evidence
blocking before AI verification. Scoped user exceptions are reported separately
from PASS. See the project contract for schema version 2 and examples.

Declare rewriting generators/builds as `prepare` commands before broad checks,
inspect their changes, and freeze the candidate for review. Optional reviewed input
scopes allow receipts/live observations to survive unrelated edits; final checks
always cover the complete tree. Each attempt preserves its logs and prior receipt.
Implement/docs commands can declare their own dependency scopes, so a CSS repair
does not rerun unchanged backend checks. Successful command results retain their
original logs; failures and input-changing commands are never cached. Live gates
and `identity --criteria` share identical scope hashes within one stable invocation.
Plan browser batches with per-criterion observations and reuse unaffected evidence
after repairs, rather than repeating the full width/theme matrix.

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
npm test
npm run test:planning-browser
```

The installer test covers a project path containing spaces, resolved roles and
skills, actual AFM flow validation, update, and removal.

## Older local entry point

For an existing project using `pipelines/dev-pipeline-v1.yaml`, synchronize its
ignored local files from this catalog while keeping its configured stage, writer
model choices and existing configured helper profiles:

```sh
node scripts/sync-dev-pipeline-v1.mjs /absolute/project/root
```

This writes the local flow, helper, helper tests, contract, the standalone planning
toolkit at `pipelines/dev-pipeline-v1-planning/`, and a new immutable
skill library under `pipelines/skill-libraries/`. It preserves older libraries
and does not change active run snapshots or launch a run. New runs use the updated
entry point. Use the installer for the normal managed `dev-pipeline` package.
