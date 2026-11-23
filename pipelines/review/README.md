# Review

[Add to AFM Desktop](afm://library/install?source=https%3A%2F%2Fgithub.com%2Fakopichin%2Fafm-pipelines%2F%2Fpipelines%2Freview%40v2.6.0)

macOS command when viewing on GitHub.

```sh
open 'afm://library/install?source=https%3A%2F%2Fgithub.com%2Fakopichin%2Fafm-pipelines%2F%2Fpipelines%2Freview%40v2.6.0'
```

A read-only review in three stages: agree on the scope, collect five independent
stage-helper reviews, then deduplicate and rank the findings in `report.md`.
Requires AFM 3.1.4+, Git, Python 3.9+, collaboration and configured provider access.
The coordinator defaults to Sonnet 5.5; the five reviewers use GPT-6.1 Sol xhigh.
Browser access is disabled. No implementation, commits or automatic fixes run.

From the project you want reviewed:

```sh
afm pipelines inspect /path/to/afm-pipelines/pipelines/review
afm run --pipeline /path/to/afm-pipelines/pipelines/review
```

After the package is committed and published, a Git source can be used too:
`github.com/akopichin/afm-pipelines//pipelines/review@<commit-or-tag>`.
Existing tags created before this package was added do not contain it.
Use `--pipeline-options ./options.yaml` for role overrides, as described in the
repository's [role settings](../../docs/model-bindings.md). Recipes/profiles start
with `review-`; `pipeline.yaml` lists all six roles. Overrides replace complete
records, so retain the Claude auth mapping when changing the coordinator model.

## 1. Scope

The interactive scope stage asks what to review unless you already supplied it:

- **Versus master/main or another branch/ref:** committed changes from the merge
  base to HEAD. The ref must exist locally and the checkout must be clean.
- **Uncommitted:** the combined tracked delta from HEAD, including staged and
  unstaged edits, plus non-ignored untracked files. Staged changes are not counted
  twice; ignored files are excluded. Unborn Git repositories need a first commit
  or an explicit file-set review.
- **File set:** explicit files/directories, including non-Git projects. This
  reviews their current content without attributing defects to a change.

The flow uses the current checkout (`worktrees: false`). Do not pass `--worktree`
for a review of dirty files: a separate checkout does not inherit them. No fetch,
checkout or stash runs. When a branch review has dirty files, choose uncommitted
review or arrange a clean checkout yourself. Do not edit the candidate during
review; a fingerprint check before and after collection and before synthesis
marks changed inputs incomplete. This detects changes at those checkpoints; it
is not an immutable source snapshot or a lock against concurrent editors.

`scope/scope.json` records root, comparison, merge base, HEAD and fingerprint;
`changes.patch` and `files.json` record the delta and input hashes. `brief.md`
records the goal and exclusions. In file-set mode, `.git`, `.afm`, `node_modules`
and `__pycache__` are excluded from recursive traversal. Run artifacts are excluded.
Review artifacts may contain source code; keep them with the project's run data.

## 2. Independent review

Five declared **stage assistants**, not standing team agents, receive separate
requests before the coordinator waits for the batch:

| Perspective | Focus |
| --- | --- |
| Correctness | Behavior, edge cases, data integrity and regressions |
| Security | Reachable threats, access boundaries, injection and secret exposure |
| Reliability | Concurrency, cancellation, lifecycle, retries and persistence |
| Performance | Evidence-backed CPU, memory, queue and I/O risks |
| Contracts and tests | Compatibility, integration, UX promises and regression gaps |

Helpers use `on_message` so the coordinator can give each the agreed scope and
save request-bound full results. They do not inherit the stage prompt: each
profile explicitly loads `contracts/review.md`. Advisory mode allows defects to
be reported without becoming a repair gate; the review contract still requires
all five results for complete coverage. Provider/task concurrency limits may
queue some reviewers. No extra assistant is spawned to bypass limits.

Source inspection is the default check budget. A bounded reproduction needs an
explicit grant; the pipeline does not run the entire suite or start the app.
Native host execution does not provide Docker's filesystem isolation guarantees.
Each batch has a 30-minute wait deadline. Failures, timeouts, missing helpers and
inaccessible inputs appear as incomplete coverage, not a clean review.
`review/results/` preserves full responses; `ledger.json` keeps IDs/outcomes;
`findings.md` retains every raw finding. Resume reuses recorded requests.

## 3. Report

The coordinator checks evidence, merges duplicate root causes and prioritizes
confirmed findings from P0 to P3. It records a disposition for every raw finding,
including merged, rejected and unconfirmed items. Existing defects are separate
from regressions. Reviewer agreement is not a substitute for evidence.

The final artifacts are **`<run-dir>/report/report.md`** and
`report/dispositions.json`. The report includes the exact scope, five-perspective
coverage, ranked findings with source locations and evidence, limitations and
recommended fix order. AFM shows the report as a stage artifact and the coordinator
returns its path with a short summary. It does not overwrite a project's existing
`report.md`. Zero findings is valid; missing coverage remains visible.
