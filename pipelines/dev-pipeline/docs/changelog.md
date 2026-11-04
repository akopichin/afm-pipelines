# Changelog

## 2026-11-04

### Improvement:

- Replace the Opus implementation writer with ЛинусХ, Claude Sonnet 5.5 `xhigh`,
  reserved for documented escalations after repeated failed repairs and independent
  diagnosis or an explicit user handoff. Initial work and first repairs stay with
  backend/frontend writers; complexity alone does not activate the reserve.
- Include update options that explicitly apply all five Sonnet defaults while
  preserving saved choices for other roles and profiles used by existing runs.
- Default the backend/frontend writers and work/documentation coordinators to
  Claude Sonnet 5.5 with `medium` reasoning instead of `high`.

## 2026-11-03

### Fix:

- Remove the Get progress button from implement, live-run and docs so requesting
  a progress report cannot revise the stage.

### Improvement:

- Use GPT-6.1 Sol with `xhigh` for AI verify and reuse its installed profile for
  independent code, design, tests and security reviews. Select architecture and
  diagnosis consultants from configured Opus 5.5 profiles with `xhigh`.
- Give all roles personal names with model/reasoning executor labels, including
  ЛинусБи and ЛинусФи for the backend and frontend standing writers.
- Replace seven dedicated specialist roles with named architecture and UX
  consultations that reuse matching configured connections or create their own
  defaults. Keep the seven writer/coordinator/verifier roles; updates retire removed
  role choices while preserving older generated profiles for existing runs.
- Ask whether to use visual grooming before opening the planning workshop.
  Accepting opens the workshop; declining keeps the ordinary written plan and
  single AFM approval without requiring visual artifacts or browser feedback.
- Preserve the choice and its dialog evidence across resume; retain the full
  visual approval gate when enabled and keep product UI acceptance independent.

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
