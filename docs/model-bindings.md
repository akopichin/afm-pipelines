# Role settings and durable identities

The package manifest maps stable role IDs to commands and helper profiles.
`agents.yaml` supplies default recipes/profiles; `--pipeline-options` replaces
selected records in memory. Run `afm pipelines inspect SOURCE --json` to see
clients, requested models, reasoning, command/profile layers and requirements.

```yaml
docker:
  agents:
    refactor-architect-a:
      type: codex
      model: gpt-6.1-sol
      reasoning: high
```

A Claude recipe must include its complete `auth` block using `env:` references.
To reuse another configured command, replace the package profile, keeping its
instructions and setting `command` to that command. Options do not copy or
mutate shared profiles. There is no automatic matching by profile title.
Dev-pipeline includes complete options presets in its `examples/` directory.

## Refactor approval identities

Refactor derives `scope/toolkit/bindings.json` from the run's durable
`operation_committed` records for its two declared team members. It records the
resolved command, profile, task ID and an executor digest over the command and
execution binding, including AFM's recipe identity. It does not reopen the
options file, infer a model from its default or copy credentials. Missing durable
team bindings stop scope setup; they never fall back to default models.

Findings schema 3 and approvals name the stable reviewer role and `executor`
from those bindings. The consensus packet hash includes the exact binding bytes
and all analysis artifacts. Changing a report, binding or plan invalidates both
architect approvals. The bindings remain frozen on resume. These checks establish
artifact and requested-executor consistency, not provider attestation; inspect
AFM task/reply metadata when checking authorship. Saved tasks remain governed by
AFM's `executor_changed` protection.

The toolkit copy in scope is an artifact bundle with per-run bindings used by
the review/export contract. AFM owns the source package snapshot; the toolkit
copy does not fetch, select versions or install profiles. Dev-pipeline retains
its per-run evidence/helper and planning receipts for the same reason.
