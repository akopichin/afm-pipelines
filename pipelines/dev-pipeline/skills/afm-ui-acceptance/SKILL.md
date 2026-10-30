---
name: afm-ui-acceptance
description: Select and exercise affected UI interactions, visual changes or prototype parity in an AFM development flow. Use when the acceptance contract includes UI behavior; backend-only tasks do not need this skill.
---

# UI acceptance by scope

Read `acceptance.ui` and the atomic criteria in the project contract. Select
coverage by observable change, not by repository stack or modified file suffix.
A backend change may affect a UI journey; a UI logic fix need not trigger a theme
matrix. The calling flow owns approval, writers, evidence identities and gates.

## Choose the mode during planning

- `behavior`: exercise changed interactions and relevant transitions. Check the
  actual effect, errors and retained state. For panels/dialogs include focus and
  responsive transitions when affected. Do not add prototype or palette sweeps.
- `visual`: also inspect affected surfaces at representative widths/states. A
  component change needs local coverage; shared layout or color tokens may need
  broader width/theme coverage. State why each selected dimension is needed.
- `prototype`: compare matching implementation/reference states side by side,
  including interactions described by the reference. Record approved deviations.
  Missing product features in a prototype are not authorization to remove them.

List concrete surfaces/states in `ui.surfaces`, with a bounded width/theme matrix
only where justified. Split separately required actions into separate criterion
IDs: opening a modal is not creating an agent; a mobile scrim click is not a
desktop scrim click. Specify required HTTP status or layout measurement as the
criterion's evidence kind before execution. Put reference inputs in the evidence
fingerprint or record immutable copies/hashes with their original paths.

Use a UX consultant only for unresolved interaction design. Select an on-demand
design reviewer for substantial visual/prototype risk; no standing UI agent or
extra review round is mandatory for an ordinary interaction fix.

## Catch mismatches during implementation

The coordinator owns the managed browser. Start an isolated fixture from current
source, never mutate the parent run. Exercise an early representative state before
the other sections are finished. In visual/prototype mode, capture it and compare
with the approved target before repeating the design across the application.
Send gaps to the standing writer with the state, expected/actual observations
and file ownership. Reviewers receive captures/measurements, not browser access.

Before implement completion, write `implement/ui-preview.json` with the live
identity (`helper identity --live`) and one row per selected surface:

```json
{"surface":"People drawer at 390", "observed":"Visible and focus inside",
 "evidence":["preview/people-390.png", "preview/focus.json"]}
```

Include `reference_evidence` with matching reference captures in prototype mode.
Record differences and dispositions in the review evidence. The preview gate
checks coverage and identity; independent review checks correctness and fidelity.
An early preview does not replace final live acceptance of the selected criteria.

## Exercise the browser behavior

Prefer real user actions and computed browser state. CSS text/selector tests do
not establish visibility, focus, contrast, overflow or layout. For contrast inspect
the actual foreground/background, opacity and affected states; for focus inspect
the active element across the full transition. Keep relevant DOM/network records
alongside screenshots. Explain simulated clipboard, hover or service behavior.

Use `helper identity --criterion ID` for each result row. A screenshot alone does
not prove a network status; a unit test alone does not prove a live interaction.
Report unexecuted criteria explicitly. A known baseline defect violating an
approved criterion still needs repair or a scoped user exception. Follow the
coordinator's invariant diagnosis rule when related focus/layout symptoms recur.
