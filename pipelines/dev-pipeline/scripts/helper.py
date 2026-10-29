#!/usr/bin/env python3
"""Project-independent command evidence and app supervision for dev-pipeline."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


OVERRIDE = "Override: continue with this recorded failure"


def read_json(path):
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def git(root, *argv):
    return subprocess.check_output(["git", "-C", str(root), *argv], stderr=subprocess.PIPE)


def root_dir():
    return Path(git(Path.cwd(), "rev-parse", "--show-toplevel").decode().strip()).resolve()


def cache_dir(root):
    path = Path(git(root, "rev-parse", "--git-path", "dev-pipeline").decode().strip())
    return path if path.is_absolute() else root / path


def binding():
    root = root_dir()
    data = read_json(cache_dir(root) / "binding.json")
    if Path(data["root"]) != root:
        raise ValueError("pipeline binding belongs to another worktree")
    return root, Path(data["run_dir"])


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def fingerprint(root, extra_paths=(), exclude_paths=()):
    names = set(git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split(b"\0"))
    names.discard(b"")
    for name in extra_paths:
        path = (root / name).resolve()
        path.relative_to(root)
        if not path.exists():
            raise ValueError("missing declared input: " + str(path))
        paths = path.rglob("*") if path.is_dir() else [path]
        names.update(os.fsencode(p.relative_to(root)) for p in paths if not p.is_dir())
    result = hashlib.sha256()
    for name in sorted(names):
        path = root / os.fsdecode(name)
        if any(path == excluded or excluded in path.parents for excluded in exclude_paths):
            continue
        result.update(name + b"\0")
        try:
            mode = path.lstat().st_mode
            result.update(str(stat.S_IFMT(mode) | (mode & 0o111)).encode() + b"\0")
            if path.is_symlink():
                result.update(os.fsencode(os.readlink(path)))
            elif path.is_file():
                with path.open("rb") as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b""):
                        result.update(block)
            elif path.is_dir():
                result.update(fingerprint(path).encode())
        except FileNotFoundError:
            result.update(b"deleted")
        result.update(b"\0")
    return result.hexdigest()


def contract(run):
    path = run / "plan" / "project.json"
    data = read_json(path)
    if data.get("schema_version") != 1:
        raise ValueError("project.json needs schema_version: 1")
    if not data.get("environment_id") or not data.get("base_branch"):
        raise ValueError("project.json needs environment_id and base_branch")
    for group in ("implement", "docs", "final"):
        item = data["checks"][group]
        if not isinstance(item.get("commands"), list):
            raise ValueError(group + " needs a commands array")
        if not item["commands"] and not item.get("skip_reason"):
            raise ValueError(group + " needs commands or a justified skip_reason")
        for command in item["commands"]:
            validate_command(command)
    if not isinstance(data.get("live", {}).get("required"), bool) or not data["live"].get("reason"):
        raise ValueError("project.json needs live.required and live.reason")
    return data, digest(path)


def identity(root, run, data, contract_hash):
    return {"tree": fingerprint(root, data.get("input_paths", []), (run,)),
            "contract_sha256": contract_hash, "environment_id": data["environment_id"]}


def print_identity(args):
    root, run = binding()
    data, contract_hash = contract(run)
    value = identity(root, run, data, contract_hash)
    print(value["tree"] if args.action == "fingerprint" else json.dumps(value))
    return 0


def validate_command(command):
    argv = command.get("argv")
    if not isinstance(argv, list) or not argv or any(not isinstance(x, str) for x in argv):
        raise ValueError("commands need a nonempty argv array of strings")
    timeout = command.get("timeout", 900)
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout <= 0:
        raise ValueError("command timeout must be positive seconds")


def stop_child(child):
    if child.poll() is not None:
        return
    child.terminate()
    try:
        child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()


def execute(command, root, output):
    validate_command(command)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    cwd = (root / command.get("cwd", ".")).resolve()
    cwd.relative_to(root)
    started = time.time()
    child = None
    code = 127
    with output.open("wb") as log:
        try:
            child = subprocess.Popen(command["argv"], cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
            try:
                code = child.wait(timeout=command.get("timeout", 900))
            except subprocess.TimeoutExpired:
                code = 124
            except KeyboardInterrupt:
                code = 130
            finally:
                stop_child(child)
        except OSError as error:
            log.write((str(error) + "\n").encode())
    result = {"argv": command["argv"], "cwd": str(cwd), "exit_code": code,
              "seconds": round(time.time() - started, 3), "log": str(output),
              "process_exit_code": child.returncode if child is not None else None}
    write_json(output.with_suffix(".json"), result)
    print(json.dumps({"exit_code": code, "log": str(output)}, ensure_ascii=False))
    if code:
        print(output.read_text(errors="replace")[-4000:])
    return code


def initialize(args):
    root, run = root_dir(), Path(args.run_dir).resolve()
    directory = run / "bootstrap"
    directory.mkdir(parents=True, exist_ok=True)
    frozen = directory / "helper.py"
    if not frozen.exists():
        shutil.copyfile(Path(__file__).resolve(), frozen)
        metadata = {"schema_version": 1, "root": str(root), "run_dir": str(run),
                    "head": git(root, "rev-parse", "HEAD").decode().strip(),
                    "tree": fingerprint(root, exclude_paths=(run,)), "helper_sha256": digest(frozen), "created_at": time.time()}
        if args.flow:
            shutil.copyfile(args.flow, directory / "flow.yaml")
            metadata["flow_sha256"] = digest(directory / "flow.yaml")
        try:
            metadata["afm_version"] = subprocess.check_output(["afm", "--version"], timeout=5).decode().strip()
        except (OSError, subprocess.SubprocessError):
            metadata["afm_version"] = "unavailable"
        write_json(directory / "metadata.json", metadata)
    cache = cache_dir(root)
    cache.mkdir(parents=True, exist_ok=True)
    if frozen.resolve() != (cache / "helper.py").resolve():
        shutil.copyfile(frozen, cache / "helper.py")
    write_json(cache / "binding.json", {"root": str(root), "run_dir": str(run)})
    print(json.dumps({"run_dir": str(run), "helper": str(cache / "helper.py")}))
    return 0


def checks(args):
    root, run = binding()
    data, contract_hash = contract(run)
    key = identity(root, run, data, contract_hash)
    before = key["tree"]
    receipt = run / args.stage / ("checks-" + args.group + ".json")
    if args.reuse:
        previous = read_json(args.reuse)
        if valid_receipt(previous, key, args.group, data["checks"][args.group]["commands"]):
            write_json(receipt, dict(previous, reused_from=str(Path(args.reuse).resolve())))
            print("PASS: reused checks for this tree, contract and declared environment")
            return 0
    group = data["checks"][args.group]
    result = dict(key, group=args.group, passed=False, commands=[], skip_reason=group.get("skip_reason", ""))
    write_json(receipt, result)
    for index, command in enumerate(group["commands"], 1):
        output = receipt.parent / "checks" / args.group / (str(index) + ".log")
        code = execute(command, root, output)
        result["commands"].append(read_json(output.with_suffix(".json")))
        if code:
            write_json(receipt, result)
            return code
    after = fingerprint(root, data.get("input_paths", []), (run,))
    result["tree_after"] = after
    result["passed"] = before == after
    write_json(receipt, result)
    if before != after:
        print("Checks changed the tree; inspect the changes and rerun on a stable tree", file=sys.stderr)
        return 1
    print("PASS: " + str(receipt))
    return 0


def valid_receipt(result, key, group, expected):
    recorded = result.get("commands", [])
    if (not result.get("passed") or result.get("group") != group
            or any(result.get(k) != v for k, v in key.items()) or len(recorded) != len(expected)):
        return False
    for wanted, actual in zip(expected, recorded):
        if wanted["argv"] != actual["argv"] or actual["exit_code"] != 0 or not Path(actual["log"]).is_file():
            return False
    return True


def check_receipt(args):
    root, run = binding()
    data, contract_hash = contract(run)
    result = read_json(run / args.stage / ("checks-" + args.group + ".json"))
    if not valid_receipt(result, identity(root, run, data, contract_hash), args.group, data["checks"][args.group]["commands"]):
        raise ValueError("missing, failed or stale check receipt")
    print("PASS: current check receipt")
    return 0


def live_gate(args):
    root, run = binding()
    data, contract_hash = contract(run)
    stage = run / "live-run"
    result = read_json(stage / "result.json")
    if result.get("tree") != fingerprint(root, data.get("input_paths", []), (run,)):
        raise ValueError("live-run evidence belongs to another tree")
    if result.get("contract_sha256") != contract_hash:
        raise ValueError("live-run evidence belongs to another project contract")
    verdict, decision = result.get("verdict"), result.get("decision")
    if not result.get("reason"):
        raise ValueError("live-run result needs a reason")
    if verdict == "NOT_APPLICABLE" and not data["live"]["required"] and decision == "continue":
        return 0
    evidence = result.get("evidence", [])
    if not isinstance(evidence, list) or not evidence or not all((stage / p).is_file() for p in evidence):
        raise ValueError("live-run needs existing evidence files")
    if verdict == "PASS" and decision == "continue":
        return 0
    if verdict == "FAIL" and decision == "override":
        answer_path = (stage / result["answer_file"]).resolve()
        if answer_path.parent != stage.resolve() or not answer_path.name.endswith(".answer.json"):
            raise ValueError("override answer must belong to this live-run stage")
        answer = read_json(answer_path)
        question = read_json(answer_path.with_name(answer_path.name.replace(".answer.json", ".question.json")))
        if (answer.get("id") and answer.get("id") == question.get("id") and answer.get("from_options") is True
                and answer.get("answer") == OVERRIDE and OVERRIDE in question.get("options", [])
                and result["tree"] in question.get("question", "")
                and contract_hash in question.get("question", "")):
            return 0
    raise ValueError("live-run is not accepted: retry/abort/failure cannot release dependants")


def serve(args):
    directory = Path(args.state_dir).resolve()
    directory.mkdir(parents=True, exist_ok=False)
    argv = args.argv[1:] if args.argv[:1] == ["--"] else args.argv
    validate_command({"argv": argv})
    env = os.environ.copy()
    for name in args.unset_env:
        env.pop(name, None)
    child = None
    reason, code, ready = "error", 127, False
    started = time.monotonic()
    with (directory / "app.log").open("wb") as log:
        try:
            url = urllib.parse.urlsplit(args.ready_url)
            if url.scheme not in ("http", "https") or not url.hostname:
                raise ValueError("readiness URL must be HTTP(S)")
            try:
                connection = socket.create_connection((url.hostname, url.port or (443 if url.scheme == "https" else 80)), timeout=1)
            except OSError:
                pass
            else:
                connection.close()
                reason = "port_in_use"
                raise ValueError("readiness port is already accepting connections; refusing to test another app")
            child = subprocess.Popen(argv, cwd=Path(args.cwd).resolve(), env=env, stdout=log, stderr=subprocess.STDOUT)
            write_json(directory / "process.json", {"pid": child.pid, "argv": argv})
            while True:
                if (directory / "stop").exists():
                    reason = "stop_requested"
                    break
                if child.poll() is not None:
                    reason = "exited"
                    break
                if time.monotonic() - started > args.lifetime:
                    reason = "lifetime_exceeded"
                    break
                if not ready:
                    try:
                        with urllib.request.urlopen(args.ready_url, timeout=1) as response:
                            ready = 200 <= response.status < 400
                    except (OSError, urllib.error.URLError):
                        pass
                    if ready:
                        write_json(directory / "ready.json", {"pid": child.pid, "url": args.ready_url})
                    elif time.monotonic() - started > args.ready_timeout:
                        reason = "readiness_timeout"
                        break
                time.sleep(0.2)
        except KeyboardInterrupt:
            reason = "interrupted"
            raise
        finally:
            if child is not None:
                stop_child(child)
                code = child.returncode
            write_json(directory / "result.json", {"reason": reason, "exit_code": code, "ready": ready})
    return 0 if reason == "stop_requested" and ready else (code if code and code > 0 else 1)


def request_stop(args):
    directory = Path(args.state_dir).resolve()
    if not (directory / "process.json").is_file():
        raise ValueError("no managed app in " + str(directory))
    (directory / "stop").touch()
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if (directory / "result.json").is_file():
            print(json.dumps(read_json(directory / "result.json")))
            return 0
        time.sleep(0.1)
    raise ValueError("supervisor did not confirm shutdown; inspect its log")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    init = sub.add_parser("init", help="freeze helper/provenance and bind this worktree to a run")
    init.add_argument("--run-dir", required=True)
    init.add_argument("--flow")
    init.set_defaults(func=initialize)
    check = sub.add_parser("checks", help="run a project's declared commands, preserving failures")
    check.add_argument("--group", choices=["implement", "docs", "final"], required=True)
    check.add_argument("--stage", choices=["implement", "docs", "commit", "merge"], required=True)
    check.add_argument("--reuse", help="reuse a receipt only after confirming its environment is unchanged")
    check.set_defaults(func=checks)
    receipt = sub.add_parser("receipt", help="reject missing, failed or stale check evidence")
    receipt.add_argument("--group", choices=["implement", "docs", "final"], required=True)
    receipt.add_argument("--stage", choices=["implement", "docs", "commit", "merge"], required=True)
    receipt.set_defaults(func=check_receipt)
    context = sub.add_parser("identity", help="validate the contract and print source/contract identity")
    context.set_defaults(func=print_identity)
    gate = sub.add_parser("live-gate", help="accept recorded live evidence or an explicit dialog override")
    gate.set_defaults(func=live_gate)
    tree = sub.add_parser("fingerprint", help="print the current project's input fingerprint")
    tree.set_defaults(func=print_identity)
    server = sub.add_parser("serve", help="supervise a foreground app until stopped; never daemonize the app")
    server.add_argument("--state-dir", required=True)
    server.add_argument("--cwd", default=".")
    server.add_argument("--ready-url", required=True)
    server.add_argument("--ready-timeout", type=float, default=60)
    server.add_argument("--lifetime", type=float, default=1800)
    server.add_argument("--unset-env", action="append", default=[])
    server.add_argument("argv", nargs=argparse.REMAINDER)
    server.set_defaults(func=serve)
    stop = sub.add_parser("stop", help="request shutdown without signalling a stored/reused PID")
    stop.add_argument("--state-dir", required=True)
    stop.set_defaults(func=request_stop)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    def interrupted(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        print("dev-pipeline: " + str(error), file=sys.stderr)
        sys.exit(1)
