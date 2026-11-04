---
name: afm-dev-planning
description: Discover a project change, offer optional visual architecture grooming, and write a grounded implementation and acceptance plan for the AFM dev pipeline. Use during planning, not ordinary implementation or product UI acceptance.
---

# Development planning

Read the user's task, applicable AGENTS.md files, contribution guide, build commands,
and the relevant code before proposing implementation. Reuse answers already given.
Ask the flow's visual-grooming question before opening a workshop; reuse the saved
choice on resume. Ask other questions only when scope or acceptance still materially
depends on an unknown. Keep related questions together and record the answers.

Prefer the smallest coherent design that meets the confirmed behavior. Identify
real integration points, existing primitives, tests, documentation and any risky
boundaries. Split the work into sections with stable task IDs, one writer and a
file grant per task. Specify observable acceptance, focused tests and the full
project checks, including who runs each check. Define a real product scenario
with setup, expected observations, evidence and cleanup.
Assign initial sections to backend/frontend writers. Leave the reserve writer
(team ID `opus`) idle for a later recorded escalation, even for complex work or
changes spanning subsystems. Read-only architecture consultation does not grant
the reserve an implementation task.

Explain WHAT changes and WHY for every implementation section/task, visual step,
changed function, contract and planned check. Keep the current step's What/Why
visible; other steps need their own explanations, not a shared first-step preamble.
Name real source symbols and signatures, contract differences, preserved behavior
and material tradeoffs. Distinguish observed code from proposed design and checks
from completed verification. Explain categories with no applicable changes.

If visual grooming is declined, discuss the written plan through the ordinary AFM
dialog and obtain its single plan approval. No workshop, visual artifacts, browser
feedback or readiness is required. Keep the same discovery and acceptance work.

If accepted, use the frozen bootstrap/planning/README.md for the workshop protocol.
Publish the baseline and proposal early, update them with the plan during dialogue,
and answer step/element/global comments in their original threads. Match the AFM
theme. Preserve checkpoints, drafts and exact revision identity across resume.
The page's readiness button leads to the existing one AFM approval dialog; it is
not approval. Do not act as the human. The flow owns paths, gates and sealing.

Choose acceptance interfaces by changed observable behavior: API, CLI, library,
UI or documentation, combining them for mixed tasks. Explain the selection and
omissions in the contract. Backend-only work needs no product UI acceptance
protocol; optional architectural grooming is a separate choice. When UI
is affected, read the sibling `../afm-ui-acceptance/SKILL.md` and select behavior,
visual or prototype mode with bounded affected surfaces/states. A backend file
can affect a UI journey; frontend files alone do not justify a full theme sweep.
Keep the plan concise: decisions, atomic criteria, owned work and check ownership;
reference shared protocols instead of copying them into every task.

For mixed backend/UI work, give each implement/docs command and live criterion a
reviewed dependency scope where possible. Include shared code, build/configuration
and ignored inputs; document why any whole-tree fallback is necessary. Assign one
owner per broad check and distinguish a representative early preview from final
acceptance. Plan compatible observations as browser batches while preserving atomic
criterion IDs. Do not multiply the full acceptance matrix across implementation,
review and live stages when matching actual evidence can be reused.

The flow defines the plan paths, project.json schema, approval, review budget,
delegation and commit behavior. Use those contracts rather than creating a
second plan or dispatching native subagents. Explain assumptions and tradeoffs
before the single plan approval dialog. Material changes after approval require
renewed approval; routine corrections within approved scope do not.
