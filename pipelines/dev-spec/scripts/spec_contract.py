"""Validate, apply and archive the approved behavioral delta."""

import hashlib
import re
import subprocess
from datetime import datetime, timezone


SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
ID = r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+"
OPERATIONS = ("ADDED", "MODIFIED", "REMOVED")
REQUIREMENT = r"^### Requirement: (" + ID + r") — (\S[^\n]*)$"
DELTA_REQUIREMENT = r"^### Requirement: (" + SLUG + r")/(" + ID + r") — (\S[^\n]*)$"
SCENARIO = r"^#### Scenario: (" + ID + r") — (\S[^\n]*)$"


def split_blocks(text, pattern):
    matches = list(re.finditer(pattern, text, re.M))
    boundaries = [m.start() for m in matches] + [len(text)]
    return text[:boundaries[0]], [
        (m.groups(), text[m.start():boundaries[i + 1]])
        for i, m in enumerate(matches)
    ]


def scenario_ids(block):
    intro, scenarios = split_blocks(block, SCENARIO)
    if not scenarios or any(line.startswith("#### ") for line in intro.splitlines()):
        raise ValueError("every delta requirement needs a scenario with a stable ID")
    for (sid, _), body in scenarios:
        steps = re.findall(r"^- (GIVEN|WHEN|THEN) \S.*$", body, re.M)
        if steps != ["GIVEN", "WHEN", "THEN"]:
            raise ValueError(f"{sid} needs exactly one GIVEN, WHEN and THEN in order")
    return [key[0] for key, _ in scenarios]


def parse_delta(raw):
    introduction, sections = split_blocks(raw, r"^## (.*)$")
    if tuple(key[0] for key, _ in sections) != OPERATIONS:
        raise ValueError("delta.md requires ## ADDED, ## MODIFIED and ## REMOVED in order")
    if any(line.startswith("### ") for line in introduction.splitlines()):
        raise ValueError("delta requirements must be inside an operation")
    changes, scenarios = {}, {}
    for (operation,), section in sections:
        intro, blocks = split_blocks(section.partition("\n")[2], DELTA_REQUIREMENT)
        if intro.strip() or (not blocks and section.partition("\n")[2].strip()):
            raise ValueError(f"{operation} must contain domain/ID requirement blocks or be empty")
        for (domain, requirement, title), block in blocks:
            key = (domain, requirement)
            if key in changes or sum(line.startswith("### ") for line in block.splitlines()) != 1:
                raise ValueError(f"duplicate or malformed requirement near {domain}/{requirement}")
            if operation == "REMOVED" and not re.search(r"^Reason: \S", block, re.M):
                raise ValueError(f"REMOVED {domain}/{requirement} needs a Reason")
            for sid in scenario_ids(block):
                if sid in scenarios:
                    raise ValueError(f"duplicate delta scenario {sid}")
                scenarios[sid] = requirement
            body = block.partition("\n")[2]
            changes[key] = (operation, f"### Requirement: {requirement} — {title}\n{body}".rstrip())
    if not changes:
        raise ValueError("empty delta; record a justified skip_reason in project.json")
    return changes, scenarios


def load(plan, data):
    spec = data.get("spec")
    if not isinstance(spec, dict):
        raise ValueError("project.json needs a spec contract")
    delta = plan / "delta.md"
    if set(spec) == {"skip_reason"} and isinstance(spec["skip_reason"], str) and spec["skip_reason"].strip():
        if delta.exists():
            raise ValueError("skip_reason cannot coexist with delta.md")
        return None
    if (set(spec) != {"slug", "delta_sha256", "non_live"} or not isinstance(spec["slug"], str)
            or not re.fullmatch(SLUG, spec["slug"]) or not isinstance(spec["non_live"], dict)):
        raise ValueError("spec needs slug, delta_sha256 and non_live")
    raw = delta.read_bytes()
    if hashlib.sha256(raw).hexdigest() != spec["delta_sha256"]:
        raise ValueError("delta.md differs from project.json spec.delta_sha256")
    changes, scenarios = parse_delta(raw.decode("utf-8"))
    live = set()
    for criterion in data["acceptance"]["criteria"]:
        sid = criterion.get("scenario")
        if not isinstance(sid, str) or sid not in scenarios or criterion["requirement"] != scenarios[sid]:
            raise ValueError(f"criterion {criterion['id']} needs a matching delta scenario and requirement")
        live.add(sid)
    non_live = spec["non_live"]
    if (live & non_live.keys() or set(scenarios) != live | non_live.keys()
            or any(not isinstance(reason, str) or not reason.strip() for reason in non_live.values())):
        raise ValueError("map every delta scenario to live criteria or a non_live check and reason")
    return raw, changes


def split_spec(text, name):
    prefix, blocks = split_blocks(text, REQUIREMENT)
    if text and (not re.search(r"^## Requirements$", prefix, re.M)
                 or sum(line.startswith("### Requirement:") for line in text.splitlines()) != len(blocks)
                 or any(re.search(r"^## ", block, re.M) for _, block in blocks)):
        raise ValueError(f"{name} must use a final ## Requirements section and stable requirement headings")
    requirements = {key[0]: block.rstrip() for key, block in blocks}
    if len(requirements) != len(blocks):
        raise ValueError(f"duplicate requirement ID in {name}")
    return prefix, requirements


def safe_path(root, relative):
    path = root / relative
    if path.resolve() != path or not path.is_relative_to(root):
        raise ValueError(f"spec path must stay inside the worktree and contain no symlinks: {relative}")
    return path


def baseline_file(root, head, path):
    relative = str(path.relative_to(root))
    names = subprocess.check_output(["git", "-C", str(root), "ls-tree", "--name-only", head, "--", relative])
    if not names:
        return ""
    return subprocess.check_output(["git", "-C", str(root), "show", f"{head}:{relative}"]).decode("utf-8")


def project_updates(root, head, changes, pending=False, base_ref=None):
    updates = {}
    for domain in dict.fromkeys(domain for domain, _ in changes):
        path = safe_path(root, f"specs/{domain}/spec.md")
        baseline = baseline_file(root, head, path)
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if baseline and not current:
            raise ValueError(f"{path.relative_to(root)} lost its baseline file")
        if not baseline and pending and current:
            raise ValueError(f"commit the baseline for {domain} before starting dev-spec")
        _, original = split_spec(baseline, path)
        if base_ref:
            _, base = split_spec(baseline_file(root, base_ref, path), path)
        prefix, requirements = split_spec(current, path)
        for (target, rid), (operation, body) in changes.items():
            if target != domain:
                continue
            before, present = original.get(rid), requirements.get(rid)
            if (operation == "ADDED") != (before is None):
                raise ValueError(f"{operation} does not match baseline requirement {domain}/{rid}")
            after = None if operation == "REMOVED" else body
            if base_ref and base.get(rid) not in (before, after):
                raise ValueError(f"base branch changed {domain}/{rid} independently; review before merge")
            if (pending and present != before) or (not pending and present not in (before, after)):
                raise ValueError(f"{domain}/{rid} differs from the approved baseline and change; reconcile the spec")
            if after is None:
                requirements.pop(rid, None)
            else:
                requirements[rid] = after
        updated = current
        if not pending:
            _, previous = split_spec(current, path)
            if requirements != previous:
                prefix = prefix or f"# {domain}\n\n## Requirements\n"
                updated = "\n\n".join([prefix.rstrip(), *requirements.values()]) + "\n"
        updates[path] = (current, updated)
    return updates


def archive_path(root, metadata, slug):
    date = datetime.fromtimestamp(metadata["created_at"], timezone.utc).date().isoformat()
    return safe_path(root, f"specs/archive/{date}-{slug}")
