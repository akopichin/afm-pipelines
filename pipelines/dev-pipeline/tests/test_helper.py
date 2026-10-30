"""Regression checks for pipeline evidence, isolation and app ownership."""

import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest


HELPER = (Path(__file__).resolve().parents[1] / "scripts" / "helper.py").resolve()


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pipeline test ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "project with spaces"
        self.root.mkdir()
        self.run = self.root / "unignored runtime" / "run"
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.git("config", "user.name", "Pipeline test")
        self.git("config", "user.email", "pipeline@example.invalid")
        (self.root / "source.txt").write_text("original\n")
        (self.root / ".gitignore").write_text("ignored.txt\n")
        self.git("add", ".")
        self.git("commit", "-qm", "Initial fixture")
        self.invoke("init", "--run-dir", str(self.run), expected=0)
        self.project = {"schema_version": 1, "base_branch": "main", "environment_id": "test-environment-v1",
                        "input_paths": [], "live": {"required": True, "reason": "changed executable behavior"},
                        "checks": {name: {"commands": [], "skip_reason": "fixture"}
                                   for name in ["implement", "docs", "final"]}}
        self.save_contract()

    def git(self, *argv):
        return subprocess.check_output(["git", "-C", str(self.root), *argv], stderr=subprocess.PIPE).decode().strip()

    def invoke(self, *argv, expected=None):
        result = subprocess.run([sys.executable, str(HELPER), *argv], cwd=self.root,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        if expected is not None:
            self.assertEqual(result.returncode, expected, result.stdout)
        return result

    def save_contract(self):
        path = self.run / "plan" / "project.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.project))

    def command(self, code, timeout=10):
        self.project["checks"]["implement"] = {"commands": [
            {"argv": [sys.executable, "-c", code], "timeout": timeout}]}
        self.save_contract()

    def current_identity(self):
        return json.loads(self.invoke("identity", expected=0).stdout)

    def write_live(self, **updates):
        stage = self.run / "live-run"
        stage.mkdir(exist_ok=True)
        (stage / "observations.txt").write_text("Actual observations\n")
        result = dict(self.current_identity(), verdict="PASS", decision="continue",
                      reason="Observed the required result", evidence=["observations.txt"])
        result.update(updates)
        (stage / "result.json").write_text(json.dumps(result))

    def acceptance_contract(self, mode="none"):
        ui = mode != "none"
        self.project.update(schema_version=2, acceptance={
            "interfaces": ["ui" if ui else "api"], "reason": "Changed observable behavior",
            "ui": {"mode": mode, "reason": "Affected interaction" if ui else "Backend only",
                   "surfaces": ["People drawer at 390"] if ui else [],
                   "references": ["approved-prototype.png"] if mode == "prototype" else []},
            "criteria": [{"id": "L1", "requirement": "R1", "interface": "ui" if ui else "api",
                          "action": "Open drawer" if ui else "POST command twice",
                          "expected": "Focus inside" if ui else "One job",
                          "evidence_kind": "measurement" if ui else "network"}]})
        self.save_contract()

    def accepted_live(self, **updates):
        self.write_live()
        path = self.run / "live-run/result.json"
        result = json.loads(path.read_text())
        row = dict(self.current_identity(), id="L1", status="PASS", observed="Expected state observed",
                   evidence_kind=self.project["acceptance"]["criteria"][0]["evidence_kind"],
                   evidence=["observations.txt"])
        result.update(criteria=[row], repairs=[], pending_work=[])
        result.update(updates)
        path.write_text(json.dumps(result))
        return path, result

    def test_backend_acceptance_needs_no_ui_artifacts(self):
        self.acceptance_contract()
        self.invoke("ui-gate", expected=0)
        self.accepted_live()
        self.invoke("live-gate", expected=0)

    def test_live_gate_rejects_partial_stale_or_unsupported_acceptance(self):
        self.acceptance_contract("behavior")
        for mutation in [lambda r: r.update(criteria=[]),
                         lambda r: r["criteria"].append(r["criteria"][0]),
                         lambda r: r["criteria"][0].update(status="NOT_RUN"),
                         lambda r: r["criteria"][0].update(status="FAIL"),
                         lambda r: r["criteria"][0].update(observed=""),
                         lambda r: r["criteria"][0].update(tree="older-build"),
                         lambda r: r["criteria"][0].update(evidence_kind="network"),
                         lambda r: r["criteria"][0].update(evidence=["missing.png"]),
                         lambda r: r.update(pending_work=["repair-L1"]),
                         lambda r: r.update(repairs=[{"id": "F1", "status": "pending"}])]:
            path, result = self.accepted_live()
            mutation(result)
            path.write_text(json.dumps(result))
            self.invoke("live-gate", expected=1)

    def test_waiver_is_scoped_and_cannot_be_called_pass(self):
        self.acceptance_contract()
        path, result = self.accepted_live()
        row = result["criteria"][0]
        row.update(status="WAIVED", reason="User accepted the recorded limitation")
        path.write_text(json.dumps(result))
        self.invoke("live-gate", expected=1)
        authorization = path.parent / "user-direction.json"
        authorization.write_text(json.dumps({"author": "user", "body": "Accept R1 limitation"}))
        row["authorization_file"] = authorization.name
        path.write_text(json.dumps(result))
        self.invoke("live-gate", expected=1)
        result["verdict"] = "ACCEPTED_WITH_EXCEPTIONS"
        path.write_text(json.dumps(result))
        self.invoke("live-gate", expected=0)

    def test_ui_preview_is_required_and_prototype_needs_reference_capture(self):
        self.acceptance_contract("prototype")
        self.invoke("ui-gate", expected=1)
        stage = self.run / "implement"
        stage.mkdir(exist_ok=True)
        (stage / "actual.png").write_bytes(b"actual screenshot fixture")
        preview = dict(self.current_identity(), surfaces=[{
            "surface": "People drawer at 390", "observed": "Compared selected state",
            "evidence": ["actual.png"]}])
        path = stage / "ui-preview.json"
        path.write_text(json.dumps(preview))
        self.invoke("ui-gate", expected=1)
        (stage / "reference.png").write_bytes(b"reference screenshot fixture")
        preview["surfaces"][0]["reference_evidence"] = ["reference.png"]
        path.write_text(json.dumps(preview))
        self.invoke("ui-gate", expected=0)
        (self.root / "source.txt").write_text("changed product")
        self.invoke("ui-gate", expected=1)

    def test_scoped_evidence_reuses_only_declared_inputs_and_environment(self):
        self.acceptance_contract()
        self.project["live"]["input_paths"] = ["source.txt"]
        self.project["checks"]["implement"]["input_paths"] = ["source.txt"]
        self.save_contract()
        live_identity = json.loads(self.invoke("identity", "--live", expected=0).stdout)
        self.accepted_live(tree=live_identity["tree"])
        path = self.run / "live-run/result.json"
        result = json.loads(path.read_text())
        result["criteria"][0].update(live_identity)
        path.write_text(json.dumps(result))
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)
        (self.root / "README.md").write_text("documentation change")
        self.invoke("live-gate", expected=0)
        self.invoke("receipt", "--group", "implement", "--stage", "implement", expected=0)
        (self.root / "source.txt").write_text("changed product")
        self.invoke("live-gate", expected=1)
        self.invoke("receipt", "--group", "implement", "--stage", "implement", expected=1)

    def test_criterion_input_scopes_require_reexecution_only_for_affected_observations(self):
        self.acceptance_contract()
        (self.root / "other.txt").write_text("second product input")
        first = self.project["acceptance"]["criteria"][0]
        first["input_paths"] = ["source.txt"]
        self.project["acceptance"]["criteria"].append(dict(first, id="L2", input_paths=["other.txt"]))
        self.save_contract()
        path, result = self.accepted_live()
        result["criteria"].append(dict(result["criteria"][0], id="L2"))
        for row in result["criteria"]:
            row.update(json.loads(self.invoke("identity", "--criterion", row["id"], expected=0).stdout))
        path.write_text(json.dumps(result))
        self.invoke("live-gate", expected=0)
        (self.root / "other.txt").write_text("changed second product")
        result.update(self.current_identity())
        path.write_text(json.dumps(result))
        self.invoke("live-gate", expected=1)
        result["criteria"][1].update(json.loads(self.invoke("identity", "--criterion", "L2", expected=0).stdout))
        result["criteria"][1]["observed"] = "Re-executed L2 after product change"
        path.write_text(json.dumps(result))
        self.invoke("live-gate", expected=0)

    def test_nonexecutable_v2_contract_has_no_live_or_ui_obligations(self):
        self.acceptance_contract()
        self.project["live"] = {"required": False, "reason": "Documentation only"}
        self.project["acceptance"].update(interfaces=["docs"], criteria=[])
        self.save_contract()
        self.write_live(verdict="NOT_APPLICABLE", criteria=[], repairs=[], pending_work=[])
        self.invoke("live-gate", expected=0)
        self.invoke("ui-gate", expected=0)

    def test_prepare_generates_before_checks_and_does_not_repeat_the_suite(self):
        count = self.run / "suite-count"
        self.command("from pathlib import Path; p=Path(" + repr(str(count)) + "); "
                     "p.write_text(str(int(p.read_text()) + 1 if p.exists() else 1))")
        self.project["checks"]["implement"]["prepare"] = [{
            "argv": [sys.executable, "-c", "from pathlib import Path; Path('generated.txt').write_text('bundle')"]}]
        self.save_contract()
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=1)
        self.assertFalse(count.exists())
        self.invoke("prepare", "--group", "implement", "--stage", "implement", expected=0)
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)
        self.invoke("receipt", "--group", "implement", "--stage", "implement", expected=0)
        self.assertEqual(count.read_text(), "1")
        (self.root / "source.txt").write_text("new candidate")
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=1)

    def test_attempt_logs_survive_later_checks(self):
        self.command("print('first failure'); raise SystemExit(23)")
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=23)
        path = self.run / "implement/checks-implement.json"
        old = json.loads(path.read_text())
        self.command("print('success')")
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)
        self.assertIn("first failure", Path(old["commands"][0]["log"]).read_text())
        self.assertTrue(list((path.parent / "checks/history").glob("*.json")))

    def test_contract_rejects_missing_criteria_invalid_routing_and_unbounded_scopes(self):
        for change in [lambda d: d["acceptance"].update(criteria=[]),
                       lambda d: d["acceptance"]["ui"].update(mode="visual"),
                       lambda d: d["live"].update(input_paths=[]),
                       lambda d: d["live"].update(input_paths=["../other"]),
                       lambda d: d["checks"]["final"].update(input_paths=["source.txt"])]:
            self.acceptance_contract()
            change(self.project)
            self.save_contract()
            self.invoke("identity", expected=1)
        self.acceptance_contract("behavior")
        self.project["live"]["required"] = False
        self.project["acceptance"]["criteria"] = []
        self.save_contract()
        self.invoke("identity", expected=1)

    def test_command_failure_and_full_log_survive_output_budget(self):
        self.command("print('evidence\\n' * 1000); raise SystemExit(23)")
        result = self.invoke("checks", "--group", "implement", "--stage", "implement", expected=23)
        receipt = json.loads((self.run / "implement/checks-implement.json").read_text())
        self.assertFalse(receipt["passed"])
        self.assertEqual(receipt["commands"][0]["exit_code"], 23)
        self.assertEqual(Path(receipt["commands"][0]["log"]).read_text().count("evidence"), 1000)
        self.assertLess(len(result.stdout), 5000)

    def test_shell_pipeline_preserves_failure(self):
        self.project["checks"]["implement"] = {"commands": [
            {"argv": ["bash", "-o", "pipefail", "-c", "false | tail -n 1"]}]}
        self.save_contract()
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=1)

    def test_receipt_accepts_same_content_after_commit_but_rejects_new_edits(self):
        self.command("print('checked')")
        (self.root / "source.txt").write_text("changed\n")
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)
        self.git("add", "source.txt")
        self.git("commit", "-qm", "Commit verified content")
        self.invoke("receipt", "--group", "implement", "--stage", "implement", expected=0)
        (self.root / "new source.txt").write_text("new input\n")
        self.invoke("receipt", "--group", "implement", "--stage", "implement", expected=1)

    def test_ignored_declared_inputs_and_contract_changes_invalidate_receipts(self):
        (self.root / "ignored.txt").write_text("dependency v1")
        self.project["input_paths"] = ["ignored.txt"]
        self.command("print('checked')")
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)
        (self.root / "ignored.txt").write_text("dependency v2")
        self.invoke("receipt", "--group", "implement", "--stage", "implement", expected=1)
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)
        self.project["environment_id"] = "test-environment-v2"
        self.save_contract()
        self.invoke("receipt", "--group", "implement", "--stage", "implement", expected=1)

    def test_check_that_mutates_source_is_not_accepted(self):
        self.command("from pathlib import Path; Path('source.txt').write_text('formatted')")
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=1)
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)

    def test_timeout_stops_owned_command_and_records_failure(self):
        self.command("import time; time.sleep(30)", timeout=0.1)
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=124)
        receipt = json.loads((self.run / "implement/checks-implement.json").read_text())
        self.assertFalse(receipt["passed"])
        self.assertEqual(receipt["commands"][0]["exit_code"], 124)
        self.assertLess(receipt["commands"][0]["process_exit_code"], 0)

    def test_skip_requires_a_reason_and_missing_executables_fail(self):
        self.project["checks"]["implement"] = {"commands": []}
        self.save_contract()
        self.invoke("identity", expected=1)
        self.project["checks"]["implement"] = {"commands": [{"argv": ["/missing-pipeline-command"]}]}
        self.save_contract()
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=127)

    def test_reuse_requires_the_same_group_and_inputs(self):
        self.command("print('checked')")
        self.invoke("checks", "--group", "implement", "--stage", "implement", expected=0)
        receipt = self.run / "implement/checks-implement.json"
        result = self.invoke("checks", "--group", "implement", "--stage", "merge", "--reuse", str(receipt), expected=0)
        self.assertIn("reused", result.stdout)
        (self.root / "source.txt").write_text("new content")
        result = self.invoke("checks", "--group", "implement", "--stage", "merge", "--reuse", str(receipt), expected=0)
        self.assertNotIn("reused", result.stdout)

    def test_live_failure_retry_and_fabricated_override_cannot_release_gate(self):
        self.write_live(verdict="FAIL", decision="retry")
        self.invoke("live-gate", expected=1)
        stage = self.run / "live-run"
        identity = self.current_identity()
        (stage / "autonomous_execution.q1.question.json").write_text(json.dumps(
            {"id": "q1", "question": "Recorded failure: " + identity["tree"] + " " + identity["contract_sha256"],
             "options": ["Retry after a fix", "Override: continue with this recorded failure"]}))
        answer = stage / "autonomous_execution.q1.answer.json"
        answer.write_text(json.dumps({"id": "q1", "from_options": True, "answer": "Retry after a fix"}))
        self.write_live(verdict="FAIL", decision="override", answer_file=answer.name)
        self.invoke("live-gate", expected=1)
        answer.write_text(json.dumps({"id": "q1", "from_options": True,
                                      "answer": "Override: continue with this recorded failure"}))
        self.invoke("live-gate", expected=0)
        (self.root / "source.txt").write_text("another version")
        self.write_live(verdict="FAIL", decision="override", answer_file=answer.name)
        self.invoke("live-gate", expected=1)
        self.write_live(verdict="FAIL", decision="override", answer_file="../other.answer.json")
        self.invoke("live-gate", expected=1)

    def test_live_evidence_must_exist_and_match_current_inputs(self):
        self.write_live()
        self.invoke("live-gate", expected=0)
        (self.run / "live-run/observations.txt").unlink()
        self.invoke("live-gate", expected=1)
        self.write_live()
        (self.root / "source.txt").write_text("changed after acceptance")
        self.invoke("live-gate", expected=1)

    def test_live_skip_must_have_been_declared_in_contract(self):
        self.write_live(verdict="NOT_APPLICABLE")
        self.invoke("live-gate", expected=1)
        self.project["live"] = {"required": False, "reason": "documentation-only change"}
        self.save_contract()
        self.write_live(verdict="NOT_APPLICABLE")
        self.invoke("live-gate", expected=0)

    def test_run_artifacts_do_not_invalidate_evidence_even_without_gitignore(self):
        before = self.current_identity()
        (self.run / "large-evidence.log").write_text("runtime output")
        self.assertEqual(self.current_identity(), before)

    def test_binding_is_per_worktree_and_restores_the_frozen_helper(self):
        cache = Path(self.git("rev-parse", "--git-path", "dev-pipeline"))
        if not cache.is_absolute():
            cache = self.root / cache
        frozen = (self.run / "bootstrap/helper.py").read_bytes()
        (cache / "helper.py").write_text("stale cache")
        self.invoke("init", "--run-dir", str(self.run), expected=0)
        self.assertEqual((cache / "helper.py").read_bytes(), frozen)
        worktree = Path(self.temporary.name) / "other worktree"
        self.git("worktree", "add", "-qb", "other", str(worktree))
        result = subprocess.run([sys.executable, str(HELPER), "identity"], cwd=worktree,
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)

    def start_server(self, argv, **options):
        state = self.run / "live-app"
        command = [sys.executable, str(HELPER), "serve", "--state-dir", str(state),
                   "--cwd", str(self.root), "--ready-url", options.get("url", "http://127.0.0.1:1"),
                   "--ready-timeout", str(options.get("ready_timeout", 5)), "--lifetime", "15", "--", *argv]
        log = tempfile.TemporaryFile()
        self.addCleanup(log.close)
        supervisor = subprocess.Popen(command, stdout=log, stderr=log)

        def cleanup():
            if supervisor.poll() is None:
                supervisor.terminate()
                supervisor.wait(timeout=15)

        self.addCleanup(cleanup)
        return supervisor, state

    def await_file(self, path, supervisor):
        deadline = time.monotonic() + 8
        while not path.exists() and time.monotonic() < deadline:
            self.assertIsNone(supervisor.poll(), "supervisor exited before " + str(path))
            time.sleep(0.05)
        self.assertTrue(path.is_file(), str(path))

    def test_app_supervisor_captures_readiness_and_stops_only_owned_child(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        supervisor, state = self.start_server(
            [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
            url="http://127.0.0.1:" + str(port))
        self.await_file(state / "ready.json", supervisor)
        child_pid = json.loads((state / "process.json").read_text())["pid"]
        self.invoke("stop", "--state-dir", str(state), expected=0)
        self.assertEqual(supervisor.wait(timeout=5), 0)
        result = json.loads((state / "result.json").read_text())
        self.assertTrue(result["ready"])
        self.assertEqual(result["reason"], "stop_requested")
        self.assertLess(result["exit_code"], 0)
        with self.assertRaises(ProcessLookupError):
            os.kill(child_pid, 0)

    def test_app_early_exit_is_not_success(self):
        supervisor, state = self.start_server([sys.executable, "-c", "raise SystemExit(19)"])
        self.assertEqual(supervisor.wait(timeout=5), 19)
        self.assertEqual(json.loads((state / "result.json").read_text())["exit_code"], 19)

    def test_app_readiness_timeout_stops_the_child(self):
        supervisor, state = self.start_server([sys.executable, "-c", "import time; time.sleep(30)"], ready_timeout=0.1)
        self.assertNotEqual(supervisor.wait(timeout=5), 0)
        self.assertEqual(json.loads((state / "result.json").read_text())["reason"], "readiness_timeout")

    def test_app_refuses_an_already_owned_readiness_port(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            supervisor, state = self.start_server([sys.executable, "-c", "raise SystemExit(0)"],
                                                  url="http://127.0.0.1:" + str(port))
            self.assertNotEqual(supervisor.wait(timeout=5), 0)
            self.assertEqual(json.loads((state / "result.json").read_text())["reason"], "port_in_use")
            self.assertFalse((state / "process.json").exists())

    def test_interrupt_of_supervisor_still_stops_child_and_persists_exit(self):
        supervisor, state = self.start_server([sys.executable, "-c", "import time; time.sleep(30)"])
        self.await_file(state / "process.json", supervisor)
        supervisor.send_signal(signal.SIGTERM)
        self.assertEqual(supervisor.wait(timeout=15), 130)
        self.assertLess(json.loads((state / "result.json").read_text())["exit_code"], 0)


if __name__ == "__main__":
    unittest.main()
