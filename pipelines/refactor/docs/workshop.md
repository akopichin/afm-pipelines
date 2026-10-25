# Refactor workshop guide

`pipelines/refactor/flow.yaml` runs a planning workshop without changing AFM's engine or the
target project's source. It combines Strictacode diagnostics, an agent-curated
architecture map, a live browser discussion, and an explicitly approved plan.

## Run

Keep the complete package at `pipelines/refactor/` in the target Git repository. The flow enables an isolated worktree and analyzes
that worktree. Uncommitted changes in the main checkout are not automatically
part of the analyzed source. Independent stages are not globally serialized;
the current sequence is defined by `depends_on`.
Use Node.js 18+. The scope hook reuses an available Strictacode executable. If
it is missing inside a container, `setup-strictacode.sh` installs version 0.0.12
into `<run-dir>/scope/tools/strictacode/` using Python's venv and uv (or pip).
This requires network access on the first install and does not change the image
or project dependencies. Retries reuse the working environment. The executable
path is saved in `scope/strictacode-command.txt` for the analysis stage.
On native hosts, install Strictacode in your own Python environment before running.
The adapter has been inspected against Strictacode 0.0.12 / the upstream `0.0.x`
branch. The flow reads `skills/strictacode/SKILL.md` from its frozen package; no global skill installation is required.
The coordinator and workshop inherit that client; use a browser-capable Claude
or Codex adapter. Analysis additionally requires two configured team profiles.

Merge `pipelines/refactor/config.example.yaml` into the project's
`.afm/config.yaml`, preserving existing settings. It defines isolated commands
and architect profiles for **Claude Opus 5.5** (`claude-opus-5-5`) and
**GPT-6.1 Sol** (`gpt-6.1-sol`), both with `xhigh` reasoning. These are recommendations; the installer can override them and records both roles
in `bindings.json`. Other flows' model
defaults are unchanged. These recipes use Docker with `autoShim: true` and the
existing provider authentication. The Claude recipe explicitly forwards
`CLAUDE_CODE_OAUTH_TOKEN` using `auth.from` and `auth.to` environment references;
no token value belongs in YAML. Codex uses its mounted authentication state.
On a native host, configure available commands
and profiles with equivalent model and file-writing capabilities instead; the
Docker wrapper names alone are not host executables.

Enable the [managed browser](https://github.com/akopichin/afm/blob/main/docs/browser.md), then run:

```bash
AFM_COLLABORATION=1 AFM_BROWSER=1 afm run pipelines/refactor/flow.yaml --idle-timeout 24h
```

The scope hook freezes a per-run toolkit copy. It can find the toolkit in the
main checkout when the new recipe has not been committed into the worktree's
base revision yet. Subsequent stages use that frozen copy, including on resume.

The stages are **scope → analyze → validate-analysis → workshop → plan**. In the workshop, use the
map to inspect components, select stages, discuss alternatives, and approve the
result. Approval does not execute the refactoring. Approving an empty selection
explicitly records a decision to proceed without changes.

Working outputs and checkpoints live in the run's stage directories. The final
script exports the exact approved proposal steps into `plan/refactoring-plan.md`
and `plan/target.json`. It also saves a package in the worktree at
`docs/superpowers/refactors/<run-directory-name>/`: `plan.md`, `baseline.json`,
`target.json`, `decisions.json`, `report.html`, individual `plans/*.md`, cumulative
`plans/*.before.json` / `*.after.json` snapshots, `plans/index.json` with execution
order and dependencies, and a README. The HTML is a
self-contained, read-only report that can be reopened after the run closes Chrome.
The package is ready for a Git commit; the flow does not commit or merge it.
Commit or copy it before deleting the worktree. No target source code is changed.

## Independent analysis and agreement

`analyze` coordinates two named run agents. It captures one source receipt and
the raw Strictacode reports, then dispatches independent architecture reviews in
parallel. Each architect inspects the agreed source scope and writes its own
findings without reading the other's conclusions. The stage coordinator handles
dispatch, durable waits and checkpoints; it is not a third architectural opinion.

Once both reports are complete, architect A merges the architecture and proposals.
Both architects review that shared result, including architect B's objections, ranking,
omissions and alternatives. Every original finding receives an accepted, rejected
or deferred disposition with a reason. Jointly discovered findings are identified
separately. Agreement can include a justified decision to make no changes.

Findings and stages carry ordinal estimates of **benefit** and **ease**, each from
1 to 5, plus an explanation. Higher ease means simpler implementation and
verification. The initial order is benefit descending, then ease descending.
The workshop's **Порядок списка** selector switches between benefit and ease;
it does not choose stages or override prerequisites. Scores describe expected
value and cost, not measured improvements. The rubric and artifact formats are
in the frozen toolkit's `contracts/analysis-contract.md`.

Before workshop opens, the `validate-analysis` script stage checks the source
receipt and runs `consensus.cjs check`, which requires both architects' explicit
passes for the same SHA-256 packet: frozen bindings, source receipt, both independent reports,
architecture and consensus. It checks source/model identities, finding coverage,
ranking and complete-list approval. A change to any packet file invalidates both
approvals. The coordinator also checks actual AFM reply senders and request IDs;
approval JSON files alone are not cryptographic identity attestation. Missing
participants or unanswered requests never count as approval. After two failed
correction rounds, the flow asks for clarification rather than silently bypassing
agreement.

The gate is a script stage because AFM provides `AFM_STAGE_DIR` to scripts,
but not to shell `verify` commands. A failed gate blocks workshop and can be
retried without repeating the architects' completed analysis.

Artifacts include `architect_a-findings.json`, `architect_b-findings.json`, `consensus.json`,
`architect_a-approval.json`, `architect_b-approval.json` and the normal architecture/source
artifacts. `team-progress.json` records durable request/batch IDs for recovery.
Later workshop edits do not automatically acquire the initial architects' approval.

An existing run whose analysis is already complete retains that earlier result.
To use this new analysis workflow, start a fresh run, for example with a new
worktree name, keeping the old artifacts intact:

```bash
AFM_COLLABORATION=1 AFM_BROWSER=1 afm run pipelines/refactor/flow.yaml \
  --worktree refactor-dual --port 3435 --idle-timeout 24h
```

## Browser and CDP

The HTML embeds pinned `3d-force-graph`, Three.js and ELK bundles. Opening or building
a report requires no CDN requests or npm installation. WebGL2 is required for the
3D views. Rotate by dragging, pan with the right mouse button, zoom with the wheel.
The graph occupies the main viewport; stages, evidence and discussion
open in a collapsible side panel. Component buttons in that panel provide a
keyboard-accessible alternative to clicking graph nodes.
The panel reserves its own column and reduces the graph viewport instead of
covering it; on narrow screens it docks below the graph. Resizing preserves the
camera direction and adjusts its distance to the available space. The toolbar
groups modes, plan actions, and compact filter buttons together. Filter controls
open from their icons, leaving more height for the graph.

The right panel has four tabs: **Этапы** (Stages), **Планы** (Plans),
**Обсуждение** (Discussion), and **Детали** (Details). Plans organize selected
stages into separate execution plans. Stages show a short rationale and expandable steps,
risks and checks. **Разобрать** previews a stage; its checkbox includes it in
the plan. **Обсудить** opens Discussion with that stage as the message topic.
Clicking a graph component or arrow opens Details.

Discussion keeps the composer visible below the conversation. **Отправить**
(Send) or **Cmd/Ctrl + Enter** queues a message. Its status distinguishes a
browser queue from an agent-saved checkpoint; neither status means an answer
has arrived. Replies appear as separate agent cards. An unread reply marks the
Discussion tab and the panel toggle; the latter opens the latest answer.
An incoming reply does not switch tabs or interrupt reading earlier messages.

Agent acknowledgements preserve the panel's scroll, expanded cards and input
focus. Draft text and its topic survive page reloads in the same browser.
Replies observed by this UI are cached locally for conversation history;
only the latest reply is part of the portable checkpoint. If the agent publishes
a new proposal revision, the panel explains that selections must be reviewed
again. This UI update itself does not change selections or approval.

Use **Сейчас / Будет / Оба** (Current / Future / Both) to switch between a single
large graph and a comparison with synchronized cameras. Future initially matches
Current until you select proposals. Added nodes glow green, modified nodes amber,
and endpoints of changed connections blue. Removed nodes and connections remain
as red ghosts in Future in the 3D/card views. These marks follow the previewed comparison. Node cards
also carry text badges, so color is not the only indication of change.
Keyboard shortcuts **1 / 2 / 3** select Current / Future / Both without resetting
the camera direction. Shortcuts **4 / 5 / 6** select Diagram / 3D graph / Hierarchy.
Press **F** to fit the graph to the available viewport, just like **Fit graph**.
The buttons show these shortcuts. Shortcuts are disabled
while typing in inputs, comments, selects or editable text, and when modifier
keys are held. Hovering over a control does not change the displayed architecture.

The five graph icons immediately after the plan icons open detail level,
neighborhood, connection visibility, relation type and component search.
Each tooltip includes the current value; a green dot marks a non-default setting.
Click an icon to edit its setting in a compact popup, use **Сбросить** to restore
its default, or close with Escape or an outside click. Filters do not occupy a
separate toolbar row. Keyboard navigation shortcuts are inactive inside the popup.

The independent **Схема / 3D-граф / Иерархия** (Diagram / 3D graph / Hierarchy) switch selects the
presentation. The default 3D graph uses a force layout in three dimensions,
shaded spheres, bloom postprocessing for highlighted categories and particles on directional connections.
Every sphere has a persistent label, including child components. 3D and Hierarchy
do not repeat node names in hover tooltips; click a node for its full name and details.
Hierarchy retains the spaced component cards. Connection visibility is remembered
separately for each layout: all connections initially in 3D, selected-component
connections in Hierarchy.
Both layouts share stable coordinates between Current and Future. Switching the
presentation does not change selections, feedback, approval or source data.

### Read an architectural change

**Схема** renders an SVG architecture diagram with nested component boundaries,
orthogonal arrows and relation labels (calls, imports, constructs, implements,
depends on). These are source dependencies, not an execution sequence. Click a
component for its responsibility/source. Connections have a 20 CSS-pixel hit
corridor in Diagram, 3D and Hierarchy, independent of zoom. Selecting a connection
highlights the same surviving edge IDs in Before and After, including when
switching layouts. Node bodies retain their own click targets.

Click the connection's **ⓘ** badge to open a compact card with endpoints, relation
type, source evidence, purpose and exact symbols when supplied by the analysis.
The card compares the current preview: added, removed, changed or retained, and
names the proposals responsible. Proposed relations are identified as designs;
missing symbol inventories are stated explicitly. Grouped diagram edges show each
underlying relation separately. The badge follows the connection while panning or
zooming. Close the card to keep the highlight, or press Escape again to clear it.
Dashed arrows represent inferred relations. Wheel zoom stays anchored to the
pointer in all three layouts. Hold **Space** and drag to pan from any part of the
visualization, including container backgrounds, nodes and labels, without selecting
them. Release Space to return to normal interaction. Ordinary background dragging
also pans the diagram; both panes use the same scale. ELK lays out each structure
independently, so a component can move when its boundary or connections change.

Use **Разобрать** (Review stage) on a proposal, even before selecting it.
The preview never selects or approves it. For a selected stage, Before is the
result of preceding selected stages and After adds only this stage. For an
unselected proposal, Before includes its prerequisites and After adds that
proposal; the description explicitly identifies it as an unselected preview.
The dedicated **Разбор изменений** navigator has a full proposal title, position
counter and progress indicator. **Назад / Далее**, or **Left / Right arrow** keys,
traverse proposals without selecting them. Shortcuts are inactive inside dialogs
and while editing text. **Список** opens a searchable picker with benefit,
complexity and plan membership for each proposal. Its **Все предложения / В планах**
tabs choose the navigation scope; selected stages retain dependency order. Inside
the picker, Up/Down move focus, Enter opens a proposal, and Escape closes it.

The review header places **Польза N/5**, **Сложность N/5**, and **Список** together
on the left, with matching control heights. Complexity is displayed
as `6 - priority.ease`, the inverse of the architects' ease estimate; its tooltip
states that conversion and their rationale. Missing ratings show a dash.

The three plan icons beside the architecture/layout controls have descriptive
hover tooltips. They are disabled in **Общий вид**, until a proposal is opened.
Use **Выбрать план** to add the current proposal to a named plan. For a selected
proposal, the same control moves it to another plan. **Новый план** opens a name
field; **Создать и добавить этап** creates the plan and assigns the proposal in one
save. **Убрать из плана** deselects it. Prerequisites, conflicts and plan dependency
cycles are validated before saving; a rejected operation leaves the session
unchanged. Dependency links open the required proposal in the review itself.
The sidebar remains optional for this workflow.
**Общий вид** returns to baseline versus the whole selected plan. Browsing does not
select or approve proposals.

Open a proposal and click **▶ До → После** in the review navigator to animate its
diagram in two phases. First, component boxes move and resize, removed boxes fade
out and additions appear. Old connections fade away at the start. Once the boxes
have settled, the resulting connections appear in a separate second phase.
The playback heading identifies the current phase. Pause, resume or replay the
transition using the controls above it. Close it with **×** or **Escape** to return
to the comparison. Playback temporarily uses Diagram when started from 3D or
Hierarchy and restores the previous layout on close. Changing the proposal or
filters cancels playback. It does not select proposals or change plans or approval.
The play button is disabled in the overview: playback shows one proposal at a time.
Reduced-motion preferences show the final frame without animation.

A stage diagram is a fragment: affected components, their containing boundaries,
and only the relations changed by that stage. It expands the necessary source
detail automatically. Removed components/relations appear in Before and are
absent in After; they are not added back as ghosts in this diagram. The left
**Об изменении** panel explains the intended benefit and expands to show responsibility changes,
risks and verification. More boxes or fewer visible arrows are not quality scores;
benefits remain hypotheses until implementation and verification.

Collapse the description with **‹** and reopen it with the **Описание ›** tab.
Drag its right edge to adjust the width; the focused divider also supports
Left/Right arrows and Home/End. Width and open/closed state persist in the browser.
The panel reserves horizontal space, leaving the full graph height available;
its text scrolls independently and keeps its position during graph redraws.
On narrow mobile screens, the open description overlays the graph instead.

The diagram covers only the analyzed scope. A focused orchestrator snapshot
cannot represent the whole application without a broader architecture analysis.

The bottom legend is an interactive highlight filter. Toggle one or more categories
to brighten matching components and dim the others; click again to deselect or use
**Reset highlights**. Finding uses violet and Removed uses red plus a wireframe
sphere (or dashed ghost card in Hierarchy). A component can match Finding even
when it also has a change marker. Highlighting does not hide components or select
refactoring stages.

Choose the detail level, relation type, neighborhood radius, and the stage to
review. A neighborhood filter starts from the selected node.
Hierarchy levels follow the actual `parent` structure, independently of node kind.
The hierarchy layout arranges siblings in spaced rows below their parent; dependency cycles
do not prevent rendering. Containment lines describe grouping, not source calls.
Dependency connections are shown for the selected component by default; choose
**All connections** for the full graph. Changed connections remain visible in Future.
Coordinates are deterministic and shared between views, including reserved slots
for proposed components; unrelated nodes stay in place when selecting stages.
Components with findings are violet, and inferred connections are dashed.
The projected view shows a design, not measured post-refactoring metrics.

The optional Node static server only delivers `workbench.html` to host Chrome,
including when agents run in Docker. It has no state API and accepts no writes.
All browser/agent interaction happens through CDP. Open `AFM_BROWSER_APP_URL`;
do not use the container's localhost URL in host Chrome. On a native host the
built HTML can also be opened directly as a file.

The page exposes:

```javascript
window.refactor.status()
window.refactor.view() // read-only renderer, mode, coordinates and change marks
window.refactor.readEvents(afterEventId)
window.refactor.checkpoint()
window.refactor.acknowledge(lastSavedEventId)
window.refactor.publish(nextDocument)
window.refactor.restore(savedCheckpoint)
window.refactor.seal(approvedRevision, approvalEventId)
window.refactor.focus(componentIds)
```

Only the human uses the selection, feedback and approval controls. The agent
polls events through CDP, writes the exact checkpoint to disk, then acknowledges
the saved event ID. Reading events does not consume them. Feedback waits while
the agent is busy, paused, or disconnected. Unlike AFM's native dialog, waiting
in this page leaves the workshop stage executing; use Pause or Continue in AFM
as needed. The **Read browser feedback** stage button can prompt another check.

Every document update requires a larger revision, preserves the baseline, and
clears selection and approval. Comments block approval until the agent publishes
a reply with an appropriate `addressed_event_id`. Prerequisites and conflicting
alternatives are checked before a selection is accepted. Approval is bound to
the exact document and selected stages; sealing rejects a stale decision.

Browser local storage helps with reloads, but it is not the durable run record.
Agents save `checkpoint.json` after event batches and updates. Use **Скачать сессию**
(Download session) for an independent JSON download; this does not approve a plan. Closing the page before the agent has
saved its latest events can leave those events only in browser storage. On resume,
recover the latest browser state or rebuild the page from the disk checkpoint;
never overwrite newer browser events. AFM may remove its Chrome profile at run end.

### Split the selection into implementation plans

A rejected selection shows the prerequisite's title and a jump button. Following
it scrolls to and highlights the required card; nothing is selected automatically.
Conflicting alternatives and selected dependents are explained the same way.

Open **Планы**, add named plans, and assign each selected stage using its plan
selector. The UI displays required plans and the computed execution order. A
circular grouping is rejected: move the related stages together or split the
groups differently. Every selected stage belongs to exactly one plan. Changes to
grouping invalidate an earlier approval; an updated proposal revision clears
selections while keeping the empty named groups for a fresh review.

**Согласовать планы** agrees to the selection and grouping. **Завершить без
изменений** records an empty selection. Neither executes source changes. Once the
agent seals approval and the final script completes, the worktree export contains
one Markdown file per nonempty plan, linked prerequisites, verification steps,
risks and before/after snapshots. Snapshots follow the full execution order,
including earlier independent plans. Implement the plans one at a time, checking
the actual source and tests between them; this flow only prepares the package.

## Resume after a UI update

Save the latest checkpoint and stop the running flow with Ctrl+C. Restart with the
same flow and worktree name, **without** `--worktree-clear`:

```bash
AFM_BROWSER=1 afm run pipelines/refactor/flow.yaml --worktree refactor --port 3434 --idle-timeout 24h
```

AFM resumes the latest unfinished run; completed scope and analyze stages are
retained. The clear flag recreates the worktree and starts a fresh run, so it must
not be used for this recovery. Default automatic recovery retries interrupted
failed stages. If automatic recovery is disabled, retry the affected stages before
starting the flow (`afm retry workshop`, and `afm retry plan` if it also failed).

The complete runtime package is frozen in `scope/toolkit`, with file hashes in
`.snapshot.json`. Updating the installed package does not update an existing run.
Keep active snapshots intact. Resume with the same snapshot; if its files have
been edited or corrupted, restore the matching backup before retrying. Do not
copy selected renderer files over a hashed snapshot. UI hot migration between
package versions is not part of the first portable release.

## Architecture document

Use `pipelines/refactor/examples/example.json` as the complete working example. It is
explicitly synthetic and must never be presented as a project scan.

| Field | Meaning |
|---|---|
| `schema_version`, `session_id`, `revision` | Contract version, run identity and proposal revision |
| `addressed_event_id`, optional `reply` | Feedback addressed by this revision and the agent's response |
| `title`, `goal`, `constraints` | Confirmed objective and boundaries |
| `source.revision`, `source.fingerprint`, `source.limitations` | Source receipt identity and explicit analysis omissions |
| `baseline.nodes` | Stable IDs, label, kind, optional parent, source range, measured metrics |
| `baseline.edges` | ID, source/target IDs, relation kind, evidence and confirmed/inferred confidence; optional `description` and `symbols` (array of exact names) |
| `findings` | ID, title, detail, severity, affected node IDs and evidence |
| `proposals` | ID, rationale, effort, risks, prerequisites, conflicts, evidence references, steps, verification and changes |
| `findings[].priority`, `proposals[].priority` | `{benefit, ease, reason}`; required for the two-architect gate, optional when reopening older documents |

Node kinds are `subsystem`, `package`, `file`, and `symbol`. Metrics, when actually
measured, are `loc`, `complexity`, `rp`, and `op`. Each proposal's `changes` has
five arrays: `add_nodes`, `remove_nodes`, `update_nodes`, `add_edges`, and
`remove_edges`. An update can change a node's label, parent, or description.
Explicitly remove edges before removing their endpoints. Added nodes have no
measured metrics. Each proposal together with its prerequisites must produce a
valid intermediate graph. Mark alternative changes with `conflicts_with`.

The prototype deliberately uses an agent-curated, bounded component map.
Strictacode's top-N report is not an inventory of the whole project, and its
internal type graph is heuristic. Require code evidence for confirmed relations;
record unknown/uncovered areas. Mixed-language projects need separate analysis
scopes and a documented combined view. A score alone does not justify a rewrite.

The source receipt hashes Git-tracked and unignored untracked files, their modes,
symlink targets, and HEAD, excluding the installed `pipelines/refactor/` tooling, the run directory and
this run's final export directory. Source changes block the
handoff and require a fresh analysis/approval. The initial prototype requires Git
and does not support Git submodules. Ignored files and external dependencies are
outside this receipt; document any relevant ones in the analysis limitations.
Approval is also checked against the receipt identity, so an old approved
checkpoint cannot be reused after rescanning changed source. Include the source
fingerprint in `session_id` to separate those browser sessions.

## Try the interface without an agent

```bash
node pipelines/refactor/scripts/workbench.mjs build \
  --input pipelines/refactor/examples/example.json --output /tmp/refactor-demo/workbench.html
node pipelines/refactor/scripts/workbench.mjs start --session /tmp/refactor-demo --port 18080
# Open http://127.0.0.1:18080, then stop the static preview when finished:
node pipelines/refactor/scripts/workbench.mjs stop --session /tmp/refactor-demo
```

The static preview uses a per-session lease; cleanup removes that lease and the
owned process exits. No process-name or PID-based kills are used. The flow's
lifecycle hook stops it on finish, failure, or interruption. If AFM is force-killed,
run the `stop` command with the workshop stage directory manually.

## Checks

```bash
afm validate pipelines/refactor/flow.yaml
node --test pipelines/refactor/tests/model.test.cjs pipelines/refactor/tests/layout.test.cjs
node pipelines/refactor/tests/browser.test.mjs
```

The browser check uses a separate headless Chrome through CDP, without an AFM
agent run. It requires Node.js 22+ and Chrome (set `CHROME_PATH` if it is not in the
standard macOS location). It checks the real UI, reload recovery, feedback,
publication, approval, sealing, and offline report loading. An actual AFM run
also requires a working model client and managed browser configuration.

Graphics dependencies are pinned in `pipelines/refactor/package-lock.json`; the
prebuilt bundle and third-party license notices live in `pipelines/refactor/ui/vendor/`.
After changing `graphics.mjs`, `diagram.mjs` or `layout.cjs`, rebuild with
`node pipelines/refactor/scripts/build-graphics.mjs`. This installs build dependencies in a
temporary directory and removes them afterwards; no npm packages are installed
in the analyzed project or at flow runtime. The bundle is copied into each frozen
toolkit and embedded in both the live HTML and offline report.
