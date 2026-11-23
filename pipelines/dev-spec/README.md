# dev-spec v2

[Add to AFM Desktop](afm://library/install?source=https%3A%2F%2Fgithub.com%2Fakopichin%2Fafm-pipelines%2F%2Fpipelines%2Fdev-spec%40v2.6.0)

macOS command when viewing on GitHub.

```sh
open 'afm://library/install?source=https%3A%2F%2Fgithub.com%2Fakopichin%2Fafm-pipelines%2F%2Fpipelines%2Fdev-spec%40v2.6.0'
```

Requires AFM 3.1.4+. This is a manifest-v2 package; no installation is needed.

```sh
afm pipelines inspect github.com/akopichin/afm-pipelines//pipelines/dev-spec@v2.2.1
afm run --pipeline github.com/akopichin/afm-pipelines//pipelines/dev-spec@v2.2.1 \
  --worktree my-dev-spec --idle-timeout 24h
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

## Pipeline at a glance

The diagram shows the default agent assignments.

```text
bootstrap                    Script
  |  Freezes the package tools for this run.
  v
plan                         ОпуПлан (Opus)
  |  Refines the task -> written plan or visual grooming on request -> delta.md.
  |  Generates C4 Before/After diagrams for the affected architecture.
  |  Shows the plan, C4 and delta in one approval dialog.
  |  May spawn Архопус (architecture) or ВасЮкс (UX) when needed.
  |  Солянка (Sol) independently verifies the approved plan.
  v
implement                    ЛинусКор (Sonnet)
  |  Assigns work to ЛинусБи and/or ЛинусФи (Sonnet).
  |  Preflight -> section reviewers where risk warrants -> final Sol verify.
  |  Preflight failures in the code go back to the writer before review.
  v
live-run                     ЛинусКор (Sonnet)
  |  Runs the product and records evidence for the approved scenario IDs.
  |  Failure -> writer repair -> independent review -> rerun affected scenarios.
  |  Солянка checks the acceptance evidence.
  v
docs                         Соня (Sonnet)
  |  Applies the accepted delta to specs/ and archives it with the results.
  |  Солянка checks the updated specs and documentation.
  v
commit                       ЛинусКор (Sonnet)
  |  Runs final checks and commits the code, specs and archive.
  v
merge                        ЛинусКор (Sonnet)
     Checks for conflicting spec changes on the current base.
     Merges locally after user approval.
```

Planning can record a reason to skip C4 when a diagram adds no value. The
writers and escalation agents are standing roles. Consultations and section
reviews are temporary helpers.

```text
Escalation in implement or live-run

Two rejected candidate rounds or two failed repairs for one task
  |
  v
Астра (GPT-6 Astra) diagnoses -> Опусарх (Opus) repairs
  |
  +-- First rejection after escalation -> user decides whether to try again
  |
  +-- Second rejection after escalation -> Фабула (Fable 5.1) verifies
      the diagnosis -> one bounded repair if warranted -> fresh review
      and acceptance
```

The [escalation skill](skills/afm-dev-escalation/SKILL.md) is the single
definition of escalation evidence, ownership and retry limits; stage prompts,
agents and verify checklists refer to it.

## Specification workflow

Existing behavior belongs under `specs/<domain>/spec.md` in the target
repository. Commit a baseline for affected existing requirements before running
a modifying or removing change. New behavior can seed a domain with ADDED.
Behavior-preserving work includes a short reason in the plan. See
[the delta contract](skills/delta-spec-contract/SKILL.md).

Coordinators check delegated work every five minutes of waiting, even when an
assignment has a one-hour budget. Wait windows are capped at 300 seconds while
the absolute task deadline stays separate. Each wake checks status, results and
recent granted logs/activity. Confirmed failed agents can be replaced before the
task deadline, after proving the previous writer and its modifying commands have
stopped. Silence alone does not establish a hang; missing stop/replacement access
is reported immediately. See [health checks](skills/afm-dev-coordinator/references/health.md).
