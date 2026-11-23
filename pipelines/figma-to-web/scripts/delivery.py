"""Check the reviewed files and publish the approved static site."""

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


BRIEF_OPTION = "Подтверждаю бриф"
SITE_OPTION = "Утверждаю версию"
DIALOG_FILE = re.compile(r"autonomous_execution\.q([1-9][0-9]*)\.question\.json")


def nonempty(path):
    if not path.is_file() or not path.stat().st_size:
        raise ValueError(f"Missing or empty file: {path}")


def require_screenshot(directory):
    if not any(
        path.is_file() and path.stat().st_size
        and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        for path in directory.rglob("*")
    ):
        raise ValueError(f"Missing browser evidence in {directory}")


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def revision(site):
    if site.is_symlink():
        raise ValueError(f"Expected a normal site directory: {site}")
    nonempty(site / "index.html")
    digest = hashlib.sha256()
    for path in sorted(site.rglob("*")):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise ValueError(f"Expected a regular static file or directory: {path}")
        if path.is_file():
            digest.update(path.relative_to(site).as_posix().encode() + b"\0")
            digest.update(file_hash(path).encode())
    return digest.hexdigest()


def require_approval(stage, option):
    questions = []
    for question in stage.glob("*.question.json"):
        match = DIALOG_FILE.fullmatch(question.name)
        if match:
            questions.append((int(match[1]), question))
    if not questions:
        raise ValueError(f"Missing AFM dialog in {stage}")
    number, question = max(questions)
    answer = stage / f"autonomous_execution.q{number}.answer.json"
    nonempty(answer)
    asked = json.loads(question.read_text(encoding="utf-8"))
    replied = json.loads(answer.read_text(encoding="utf-8"))
    if (option not in asked.get("options", [])
            or asked.get("id") != f"q{number}"
            or replied.get("id") != f"q{number}"
            or replied.get("auto_answered")
            or replied.get("answer") != option):
        raise ValueError(f"AFM dialog q{number} needs explicit approval: {option}")


def verify_brief(stage):
    nonempty(stage / "figma.md")
    require_screenshot(stage / "reference")
    require_approval(stage, f"{BRIEF_OPTION} {file_hash(stage / 'brief.md')}")


def verify_qa(stage):
    nonempty(stage / "report.md")
    require_screenshot(stage / "artifacts")
    tested_revision = (stage / "revision.txt").read_text(encoding="utf-8").strip()
    if tested_revision != revision(stage.parent / "build" / "site"):
        raise ValueError("QA must report the revision it actually tested")


def verify_acceptance(stage):
    nonempty(stage / "acceptance.md")
    for name in ("qa-functional", "qa-visual"):
        verify_qa(stage.parent / name)
    accepted = revision(stage / "site")
    require_approval(stage, f"{SITE_OPTION} {accepted}")
    return accepted


def export(stage):
    run = stage.resolve(strict=True).parent
    if (run.parent.parent.name, run.parent.name) != (".afm", "runs"):
        raise ValueError(f"Expected a run under .afm/runs: {run}")
    acceptance = run / "acceptance"
    accepted = verify_acceptance(acceptance)
    destination = run.parent.parent.parent / "figma-to-web-output"
    if destination.is_symlink():
        raise ValueError(f"Expected a normal output directory: {destination}")
    destination.mkdir(exist_ok=True)
    target = destination / run.name
    if target.exists() or target.is_symlink():
        if revision(target) != accepted:
            raise ValueError(f"Another version already exists at {target}")
        return target

    with TemporaryDirectory(prefix=".export-", dir=destination) as temporary:
        bundle = Path(temporary) / "site"
        shutil.copytree(acceptance / "site", bundle, symlinks=True)
        if revision(bundle) != accepted:
            raise ValueError("The site changed during export")
        bundle.rename(target)
    return target


def main():
    commands = {
        "revision": revision,
        "brief-revision": file_hash,
        "verify-brief": verify_brief,
        "verify-qa": verify_qa,
        "verify-acceptance": verify_acceptance,
        "export": export,
    }
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=commands)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    try:
        result = commands[args.command](args.path)
    except (OSError, ValueError) as error:
        parser.exit(1, f"figma-to-web: {error}\n")
    if result is not None:
        print(result)


if __name__ == "__main__":
    main()
