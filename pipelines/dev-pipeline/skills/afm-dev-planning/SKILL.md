---
name: afm-dev-planning
description: Discover a development task in the actual project, resolve material uncertainties, and write a grounded implementation and acceptance plan for the AFM dev pipeline.
---

# Development planning

Read the user's task, applicable AGENTS.md files, contribution guide, build commands,
and the relevant code before proposing implementation. Reuse answers already given.
Ask through the flow's dialog only when scope or acceptance still materially depends
on an unknown. Keep related questions together and record the answers.

Prefer the smallest coherent design that meets the confirmed behavior. Identify
real integration points, existing primitives, tests, documentation and any risky
boundaries. Split the work into sections with stable task IDs, one writer and a
file grant per task. Specify observable acceptance, focused tests and the full
project checks, including who runs each check. Define a real product scenario
with setup, expected observations, evidence and cleanup.

Choose acceptance interfaces by changed observable behavior: API, CLI, library,
UI or documentation, combining them for mixed tasks. Explain the selection and
omissions in the contract. Backend-only work needs no visual protocol. When UI
is affected, read the sibling `../afm-ui-acceptance/SKILL.md` and select behavior,
visual or prototype mode with bounded affected surfaces/states. A backend file
can affect a UI journey; frontend files alone do not justify a full theme sweep.
Keep the plan concise: decisions, atomic criteria, owned work and check ownership;
reference shared protocols instead of copying them into every task.

The flow defines the plan paths, project.json schema, approval, review budget,
delegation and commit behavior. Use those contracts rather than creating a
second plan or dispatching native subagents. Explain assumptions and tradeoffs
before the single plan approval dialog. Material changes after approval require
renewed approval; routine corrections within approved scope do not.
