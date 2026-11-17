---
name: afm-dev-refinement
description: Clarify the requested outcome and resolve decisions that affect the plan, delta or acceptance inside the existing dev-spec planning stage.
---

# Refine the task

1. Recover the original request and existing answers. Establish the affected
   actor or caller, the problem, the expected outcome, scope and success
   criteria. A clear small task needs only a few lines in the existing plan.
2. Read the relevant baseline specs, then verify uncertain facts using the
   repository, tests and project instructions. Distinguish the current
   behavior, the requested change and implementation choices. Define overloaded
   terms through their observable effect. For example, pin down whether
   completion refers to a stage, a helper task or a request to a standing helper.
3. Use the existing AFM dialog only for unresolved decisions that change scope,
   behavior, important tradeoffs or acceptance. Group questions whose
   prerequisites are already settled. Explain the consequence and give a
   recommended default when justified. Ask dependent questions only if the
   earlier answer makes them necessary. Recover prior answers on resume.
4. Record the decisions and rationale in dev-plan.md and apply the existing
   risk-based consultation policy. Translate the settled plan into a delta
   with delta-spec-contract. Use the flow's existing written or explicitly
   requested visual planning route and its single approval.

Based on the definition, discovery and specification sequence in [Goga
Refinement](https://github.com/qarium/goga/blob/2.1.x/goga/assets/pipelines/refinement.yml)
and its [decision rounds](https://github.com/qarium/goga/blob/2.1.x/goga/assets/skills/goga-discover/SKILL.md).
