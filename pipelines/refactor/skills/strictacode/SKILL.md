---
name: strictacode
description: Run bounded Strictacode analysis and turn metric signals into source-backed findings when investigating code quality or planning a refactor.
---

# Strictacode evidence for refactoring

Use the executable supplied by the pipeline's
`scope/strictacode-command.txt`. It may be an absolute path in the run container;
do not replace it with a host path or install dependencies into the application.
Outside the pipeline, use an existing Strictacode installation and establish the
target scope before running it.

Read existing `.strictacode.yml`, `.strictacode.yaml`, or `.strictacode.json` and
account for its language and exclusions. Do not change it as part of analysis.
Confirm language support and separate source scopes for mixed-language projects.
Exclude installed pipeline tooling, generated files and dependencies from
application conclusions. Report uncovered or accidentally included scope.

Run the bounded analysis, preserving raw output and failures:

```sh
"<resolved-strictacode-executable>" analyze <source-scope> --details --format json \
  --top-packages 5 --top-modules 5 --top-classes 10 \
  --top-methods 15 --top-functions 15
```

Inspect the actual reported schema before interpreting it. RP, OP, complexity,
LOC, maxima and percentiles are investigation signals, not proof of a defect.
Do not infer import centrality, fan-in, exact line numbers, or architectural
boundaries from fields the report does not provide. Find those in source and
name the evidence separately. A percentile alone does not prove a systemic issue.

For each candidate finding, inspect the relevant source, its callers and tests.
Record the file, symbol, line range, concrete change cost or behavior risk,
counterexamples, and any uncertainty. Missing/failed analysis is unknown, not
healthy. A result with no justified findings is valid.

Describe bounded alternatives and behavior-preservation checks. Rank benefit
and ease with explicit reasons; distinguish measurements from estimates. Do not
invent future metric improvements or recommend a rewrite solely from a score.

In the refactor pipeline, follow the separately supplied two-architect contract
and artifact paths. This skill supplies evidence; it does not replace either
architect, their consensus gate, or the user's selection and approval.
