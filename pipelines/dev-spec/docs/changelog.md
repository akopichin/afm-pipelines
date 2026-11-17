## 2026-11-17

### Improvement:

- Check delegated agents every five minutes using bounded wait windows separate
  from assignment deadlines. Inspect status/results and recent activity, recover
  confirmed terminal failures before the full deadline, and preserve safe writer
  ownership, partial work and repair counters during replacement.
- Add Фабула (Claude Fable 5.1, medium) to independently verify Astra's findings
  and corrective design only after two rejected post-escalation candidate rounds
  for the same task. Keep it idle on first escalation and the first rescue rejection.
- Allow one exceptional bounded Fabula repair of concrete residual bugs after a
  repeatedly rejected Astra/Opus rescue, preserving ownership, counters and fresh independent
  acceptance. Further failures still require a user decision.

## 2026-11-15

### Improvement:

- Migrate to AFM manifest v2, package recipes and direct Git execution with pipeline options; remove project installation.

# Changelog

## 2026-11-13

### Improvement:

- Show a source-grounded C4 After image in the ordinary plan approval question,
  with compact Before/After links for C2/C3/C4 views. Keep shared positions and
  clear labels/colors for existing, changed, added and removed elements.
- Bundle an offline Node.js renderer, layout engine and Cyrillic fonts; freeze
  them into each run. Bind source, plan, model, PNGs and the actual approval
  question while retaining earlier image revisions. Non-architectural changes
  can explain why no diagram is useful. No AFM code change or extra approval.

## 2026-11-10

### Improvement:

- Add a standing Astra `xhigh` diagnosis agent and restore Opus 5.5 `xhigh` as
  the reserve implementation writer. After two rejected candidate rounds for one
  logical task, require Astra diagnosis and an ownership handoff to Opus before
  the third correction/review round, including verify and live-run repairs.
- Count complete candidate batches across stages/resumes, validate minimal fixes
  in scratch, and require independent acceptance after one bounded rescue. Preserve
  explicit user handoffs and report unresolved rescues instead of restarting them.
- Add explicit Astra/Opus update options, preserve saved model choices and old-run
  profiles/skills, and add the new diagnosis agent when synchronizing legacy flows.
- Use ordinary written planning by default without offering visual grooming or
  asking a planning-mode question. Hide the Read grooming feedback button from
  the standard flow while preserving the workshop and its manual feedback action.
- Keep visual grooming available on explicit request and preserve saved choices
  and full approval checks for requested or resumed workshops. Ordinary planning
  needs no visual artifacts or mode receipt.

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
