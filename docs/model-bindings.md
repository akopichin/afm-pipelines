# Pipeline roles and model bindings

Installer protocol 1 supports per-pipeline model choices. Refactor and dev-pipeline
use stable roles and configurable bindings instead of hard-coded model identities.
Older runs retain their original frozen scripts and contracts.

## Roles, profiles and choices

A role describes work inside one pipeline. The package declares roles in
`pipeline.yaml` under `setup.models`: `role` is a stable identifier,
`team_member` identifies a flow team entry; `stage_ids` selects stage commands;
`verify_stage_ids` selects AI verify commands; and `profile_token` identifies a
specialist profile name in a prompt. `profile`, `command`, `client`, `model` and
`reasoning` describe recommended defaults from `config.example.yaml`.
Packages can declare different numbers of roles and different defaults. The
installer does not assume every pipeline has two architects.

The user's options JSON maps `roles.<role>` to a profile reference and/or explicit
client/model/reasoning choices. See [setup options](installer.md#select-models-settings-and-skills).
Resolution uses explicit choices first, then the selected profile, then package
defaults when no profile is selected. A missing profile is an error. Changing
client requires a model choice and clears the previous client's recipe options.

Existing profiles are copied, even when no overrides were supplied. Each role
gets a command/profile named `pipeline-<pipeline>-<role>-<configuration-hash>`.
This separates its settings from shared profiles and preserves older profile
versions across updates. Profile instructions are copied; generated titles show
the selected role and model. Authentication values must remain `env:` references.
The original profile is never edited as part of pipeline customization.

The installer saves user choices in its local receipt and writes the effective
configuration into the installed package's `bindings.json`:

```json
{
  "schema_version": 1,
  "pipeline": "refactor",
  "roles": {
    "architect_a": {
      "profile": "pipeline-refactor-architect-a-<hash>",
      "command": "pipeline-refactor-architect-a-<hash>",
      "client": "claude",
      "model": "claude-opus-5-5",
      "reasoning": "xhigh",
      "execution": "docker"
    },
    "architect_b": {
      "profile": "pipeline-refactor-architect-b-<hash>",
      "command": "pipeline-refactor-architect-b-<hash>",
      "client": "codex",
      "model": "gpt-6.1-sol",
      "reasoning": "high",
      "execution": "docker"
    }
  }
}
```

The example names are illustrative; the installer computes actual hashes.
The flow's team profiles, stage commands, specialist names and binding file are
generated in the same plan.
Two roles may use the same model but remain separate agents. Provider/model
availability is not inferred from configuration validity.

## Refactor's frozen review contract

The scope hook copies `bindings.json` together with the toolkit into the run.
The coordinator reads these settings before dispatch. `architect_a` and
`architect_b` independently write their reports; architect A merges and both
review the complete result. Report and consensus schema version 2 uses these
stable role IDs. Each report/approval records the requested model from the
binding file. Names of providers are not reviewer IDs.

The consensus gate checks both roles against the frozen bindings. Its packet
hash includes the exact bindings bytes plus source, both reports, architecture
and consensus. Changing either bindings or packet invalidates both approvals.
The toolkit snapshot also hashes all runtime files, including the bindings.

These checks establish artifact consistency, not cryptographic execution
identity. The coordinator must still match AFM participants and durable replies
to the assigned profiles, record actual runtime metadata when available, and
stop if it discovers a configuration mismatch. A requested model alias is not
proof of the provider's underlying model version.

Updating the installed package creates new profiles when settings change and
preserves old ones. Existing run snapshots keep their original bindings. Manual
edits to generated AFM profiles can still change dispatch: `verify` detects them,
but direct AFM commands do not run the installer. Do not edit those profiles to
reconfigure an existing run; prepare a new installation plan and new run instead.

## Supported scope

The first adapters support Claude/Codex Docker recipes and AFM reasoning levels.
Refactor's coordinator inherits the project's default client; dev-pipeline has
explicit stage coordinator roles. Arbitrary host commands,
additional provider adapters, runtime rebinding and an independent reusable
binding-file format are future extensions. The current project choices live in
installer receipts, not in a hypothetical `pipelines/bindings.yaml`.
