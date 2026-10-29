# Install pipelines

The AFM `afm-pipelines` skill guides discovery and setup. This repository supplies
its deterministic helper, `scripts/pipelines.mjs` (installer protocol 1).
No separate Go binary, background service, or AFM engine change is required.

## Prepare a catalog checkout

Use Node.js 22+, npm, Git and an installed AFM binary. Clone the catalog outside
the target project, select a published commit or release, and keep it detached:

```sh
git clone https://github.com/akopichin/afm-pipelines.git
cd afm-pipelines
git checkout --detach <commit-or-tag>
npm ci --ignore-scripts --no-audit --no-fund
node scripts/pipelines.mjs list
node scripts/pipelines.mjs inspect --project /absolute/path/to/project
```

The target must be a Git project root. Catalog lookup and planning do not launch
agents. `inspect` reports tool availability and profile names without exposing
configuration values or credentials. A dirty catalog checkout can be used for
local development, but its receipt explicitly records `dirty: true`; it is not
a reproducible published revision.

## Select models, settings and skills

Read the selected `pipelines/<name>/pipeline.yaml` and its README. Each package
has its own roles and recommended models. Dev-pipeline binds writers, stage
coordinators, AI verify commands and on-demand specialist profiles; refactor
binds two team architects. Create an options JSON file, for example:

```json
{
  "settings": true,
  "skills": ["claude", "codex"],
  "roles": {
    "architect_a": {
      "client": "claude",
      "model": "claude-opus-5-5",
      "reasoning": "xhigh"
    },
    "architect_b": {
      "client": "codex",
      "model": "gpt-6.1-sol",
      "reasoning": "high"
    }
  }
}
```

- Omitted roles use package recommendations on first install and saved choices
  on updates. Partial role changes preserve its other selected fields.
- `profile` names an existing local or global AFM collaboration profile to copy.
  Optional `client`, `model` and `reasoning` override the copy. The source profile
  remains unchanged. It must resolve to a supported Docker recipe with an
  explicit model. Changing client also requires choosing its model.
- Model identifiers are configurable strings, not a closed installer list.
  Reasoning accepts AFM's `minimal`, `low`, `medium`, `high`, `xhigh`, `max` levels;
  AFM maps those to each client's supported levels. Provider acceptance is not
  established by a local validation.
- `settings: true` proposes enabling Docker, automatic recipe wrappers,
  collaboration and managed browser in the project's `.afm/config.yaml`.
  `false` requires these settings to be enabled already. Unrelated fields and
  YAML comments are preserved.
- `skills` chooses optional project discovery copies: `.claude/skills` for
  Claude and `.agents/skills` for Codex. See the official
  [Codex skill locations](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).
  Omit it on first install for bundled runtime instructions only; use `[]` to
  remove previously managed discovery copies on update.

The first version generates **Docker recipes for Claude and Codex**. It does
not install Docker, AFM, provider CLIs, or credentials. The guiding skill offers
missing setup separately. Authentication uses existing provider login or AFM
`env:` references. No model weights are downloaded and no paid probes run.
Arbitrary host-command profiles and additional clients need adapters before
this helper can configure them reliably. The coordinator continues using the
project's normal AFM client; the manifest declares the team roles it manages.

## Review, apply and verify

From the catalog checkout:

```sh
node scripts/pipelines.mjs plan refactor \
  --project /absolute/path/to/project \
  --options /absolute/path/to/options.json \
  --out /absolute/path/to/install-plan.json
node scripts/pipelines.mjs apply /absolute/path/to/install-plan.json
node scripts/pipelines.mjs verify refactor --project /absolute/path/to/project
```

`plan` writes a private file and prints a summary of the revision, effective
models, changed files, settings and skills. It does not change the target project.
The plan contains file payloads; keep it outside Git and do not share its raw
contents. Show the summary to the user and resolve any additional choices before
`apply`. Plans are local instructions, not a format for accepting untrusted
installation requests from third parties.

`apply` checks that the configuration, installed files and catalog inputs still
match the plan. It refuses symlink destinations, local modifications and profile
collisions. It backs up touched files, records a transaction journal, applies
only the selected changes, and runs `afm validate`. Failure rolls the changes
back. AFM diagnostics are saved privately beside the backups. If inputs changed,
make a new plan rather than forcing an old one.

`verify` checks managed files, configuration and the installed flow. Its output
separately lists checks still needed: provider login, model availability, Docker
runtime and managed-browser access. A successful local validation does **not**
claim those checks passed. No real model run is started automatically.

## Project files and worktrees

The package is installed at `pipelines/<name>/`, including a generated
`bindings.json`. Generated commands/profiles are specific to pipeline, role and
configuration hash, so changing a model does not overwrite an older run's
profile. Receipts under `.afm/pipelines/receipts/` preserve choices, ownership,
source revision and file hashes. Backups and journals live under
`.afm/pipelines/backups/`. They can contain original configuration: keep `.afm/`
private and ignored by Git. Receipts and backups use restricted file permissions.

Dev-pipeline also binds its `skills_dir`, exact reviewer skill paths and read-only
memory path to the target project's main checkout. Its bootstrap can load an
installed but uncommitted package from that checkout when the run uses a linked
worktree. Keep that main checkout available while the run is active.

The install plan adds `.afm/` to the project's `.gitignore` if missing; this
entry is retained on removal along with the local artifacts it protects.

The package directory can be committed. The local AFM configuration is separate:
when moving to another machine, use the installer there to recreate profiles and
its receipt. Committing package files alone does not install those profiles.

Before a worktree run, make sure the project's required tracked configuration and
optional skill files are available in that worktree. AFM's project configuration
and worktree handling remain authoritative. Refactor's scope hook can locate the
package in the main checkout if it was not yet committed into the new worktree.
It freezes the package and its bindings into that run; later package updates do
not rewrite the snapshot. Do not manually edit generated profiles that older
runs use. Run `verify` after configuration changes; raw `afm run` does not invoke
this installer or enforce its receipt checks.

## Update, removal and recovery

For an update, select a new catalog commit and repeat `plan` and `apply`.
Saved model/skill choices are reused; supply options to change them. Existing
profile versions are retained for older runs. Edited managed files cause a
conflict. Inspect and preserve those edits before deciding how to reconcile them.

Stop runs using the package before removing its profiles:

```sh
node scripts/pipelines.mjs remove refactor --project /absolute/path/to/project \
  --out /absolute/path/to/remove-plan.json
node scripts/pipelines.mjs apply /absolute/path/to/remove-plan.json
```

Removal affects owned, unchanged files and profiles. It preserves refactoring
plans, run snapshots, credentials, shared AFM settings and pre-existing identical
files it did not create. Discovery skill files referenced by another installed
package are retained; retained shared files may need manual cleanup after their
last consumer is removed. No client executable is uninstalled.

An apply lock prevents concurrent installations. If the process was interrupted:

```sh
node scripts/pipelines.mjs recover --project /absolute/path/to/project
```

Recovery refuses a live installer, a different host, or subsequent user edits.
It restores an interrupted transaction from its journal and removes the lock.
If recovery cannot proceed, inspect the private journal and backups; do not
blindly delete the lock. Ordinary caught failures already roll back automatically.

## Current boundaries

The helper supports project-local installs, updates, removal and recovery.
Global skill installation, automatic tool installers, arbitrary provider
adapters and migration of active runs are outside this version. Catalog/package
updates never silently change the models used by an existing frozen toolkit.
See [model bindings](model-bindings.md) for the role contract.
