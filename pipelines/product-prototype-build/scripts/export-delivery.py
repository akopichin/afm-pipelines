"""Publish the verified handoff in the AFM project directory."""

import fcntl
import os
from pathlib import Path
import re
import shutil
import sys
from tempfile import TemporaryDirectory
from urllib.parse import quote, unquote, urlsplit, urlunsplit


MARKDOWN_LINK = re.compile(r"(\]\()(<[^>\n]+>|[^\s()<>]+)(?=[\s)])")
REQUIRED = ("behavior.md", "design-system.md", "prototype/index.html", "design-system/index.html")
RUN_MARKER = ".afm-run-id"


def relink_report(report, relative_path, staging, target, source):
    def relocate(match):
        link = match[2].strip("<>")
        url = urlsplit(link)
        if url.scheme or url.netloc or not url.path or url.path.startswith("/"):
            return match[0]
        path = Path(unquote(url.path))
        if (staging / relative_path.parent / path).exists():
            return match[0]
        original = (source / relative_path.parent / path).resolve()
        if not original.is_relative_to(source.parent) or not original.exists():
            return match[0]
        relative = os.path.relpath(original, target / relative_path.parent)
        rewritten = urlunsplit(("", "", quote(relative), url.query, url.fragment))
        if match[2].startswith("<"):
            rewritten = f"<{rewritten}>"
        return match[1] + rewritten

    contents = report.read_text(encoding="utf-8")
    updated = MARKDOWN_LINK.sub(relocate, contents)
    if contents != updated:
        report.write_text(updated, encoding="utf-8")


def copy_delivery(source, staging, target):
    for name in REQUIRED:
        if not (source / name).is_file():
            raise ValueError(f"Missing delivery file: {source / name}")

    for name in ("behavior.md", "design-system.md", "approval.md", "execution_summary.md"):
        if (source / name).is_file():
            shutil.copy2(source / name, staging / name)
    for name in ("prototype", "design-system", "artifacts"):
        if (source / name).is_dir():
            shutil.copytree(source / name, staging / name)
    for report in sorted((source / "verify").glob("*/report.md")):
        destination = staging / report.relative_to(source)
        destination.parent.mkdir(parents=True)
        shutil.copy2(report, destination)

    # Keep the verified source and its hashes intact while fixing links in the export.
    for report in staging.rglob("*.md"):
        relink_report(report, report.relative_to(staging), staging, target, source)
    (staging / RUN_MARKER).write_text(source.parent.name + "\n", encoding="utf-8")


def publish(source, project):
    run_id = source.parent.name
    target = project / "delivery"
    # Serialize publication within a project so concurrent runs keep both bundles.
    project_fd = os.open(project, os.O_RDONLY)
    try:
        fcntl.flock(project_fd, fcntl.LOCK_EX)
        if target.is_symlink() or (target.exists() and not target.is_dir()):
            raise ValueError(f"Delivery path is not a normal directory: {target}")
        if target.exists() and not already_published(target, run_id):
            target /= run_id
        if already_published(target, run_id):
            return target
        if target.exists() or target.is_symlink():
            raise FileExistsError(f"Delivery destination already exists: {target}")

        with TemporaryDirectory(prefix=".delivery-", dir=target.parent) as temporary:
            staging = Path(temporary) / "bundle"
            staging.mkdir()
            copy_delivery(source, staging, target)
            staging.rename(target)
        return target
    finally:
        os.close(project_fd)


def already_published(target, run_id):
    marker = target / RUN_MARKER
    return (not target.is_symlink() and marker.is_file()
            and marker.read_text(encoding="utf-8").strip() == run_id)


def main():
    source = Path(sys.argv[1]).resolve(strict=True) / "delivery"
    runs = source.parent.parent
    if (runs.parent.name, runs.name) != (".afm", "runs"):
        raise ValueError(f"Expected a run under .afm/runs: {source.parent}")
    print(f"Delivery saved to {publish(source, runs.parent.parent)}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        sys.exit(f"Delivery export failed: {error}")
