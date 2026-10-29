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

The flow defines the plan paths, project.json schema, approval, review budget,
delegation and commit behavior. Use those contracts rather than creating a
second plan or dispatching native subagents. Explain assumptions and tradeoffs
before the single plan approval dialog. Material changes after approval require
renewed approval; routine corrections within approved scope do not.
