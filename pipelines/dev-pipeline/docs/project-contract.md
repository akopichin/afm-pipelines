# Development project contract

The `plan` stage writes `dev-plan.md` and `project.json` under its absolute
`AFM_STAGE_DIR`. No plan or check output belongs in product source files.
The flow prompt defines review selection, timing, approval and delivery rules.

`project.json` has `schema_version: 1`, `base_branch`, `environment_id`,
`input_paths`, `checks`, `live` and `review`:

- `checks` has `implement`, `docs` and `final` groups. Each group has `commands`;
  every command has an `argv` array and may have `cwd` relative to the Git root
  and a positive `timeout` in seconds. An empty group needs `skip_reason`.
  Shell pipelines must use `bash -o pipefail -c` in `argv`.
- `input_paths` names relevant ignored inputs that affect evidence. Tracked and
  nonignored untracked files are fingerprinted automatically.
- `environment_id` identifies the real toolchain and dependency setup. Update
  it when that setup changes; reusing a receipt also requires unchanged inputs,
  check group, contract and environment.
- `live` has a Boolean `required` and a reason. The plan describes setup,
  executable user steps, expected observations, evidence and cleanup.
- `review` records the task risk, selected role-to-profile mappings, available
  escalation profiles, consultants and per-section reviewer selections. Selected
  perspectives require committed helper results; unselected ones do not.

The helper command is `python3 "$(git rev-parse --git-path dev-pipeline/helper.py)"`
after `bootstrap`. Run `--help` for `identity`, `checks`, `receipt`, `live-gate`,
`serve` and `stop`. The check helper records the real exit code and rejects
receipts from changed source or contract inputs. The live gate requires current
identity, evidence files and an approved result or exact explicit override.

The bootstrap copies the helper into the run and binds the effective worktree.
The installed package also contains the skill library used by stage and team
agents. When temporary reviewers or verify agents are spawned, the coordinator
must give them the installed absolute `afm-review-work/SKILL.md` and
`afm-check-evidence/SKILL.md` paths explicitly. The coordinator skill's
references govern durable request IDs, finite waits and repair escalation.
