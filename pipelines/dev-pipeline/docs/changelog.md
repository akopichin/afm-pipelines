# Changelog

## 2026-11-02

### Improvement:

- Add an architecture workshop during development planning with incremental
  Before/After diagrams and Graphite/Goga dark/light semantic colors.
- Require What/Why explanations on every step and technical detail, including
  changed functions/signatures, contracts, source references and planned checks.
- Connect plan, step and element comments to the planning agent, retain drafts
  and discussion checkpoints, and preserve original reply targets across updates.
- Bind the existing human AFM approval to the displayed revision, plan, project
  contract and source identity; retain a portable report and frozen per-run tools.

### Fix:

- Wait for checks through their original job IDs, saved child PIDs or validated
  result files with finite deadlines. Avoid process-name wait loops that match
  themselves, and finish owned background checks and monitors before delivery so
  the agent can exit and the stage can complete.
