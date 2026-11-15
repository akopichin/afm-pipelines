#!/usr/bin/env python3
"""Record and recheck the exact source inputs of a read-only review."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import subprocess


def git(root, *args):
    env = dict(os.environ, GIT_OPTIONAL_LOCKS='0')
    return subprocess.check_output(['git', '-C', str(root), *args], env=env,
                                   stderr=subprocess.PIPE)


def inside(path, parent):
    return path == parent or parent in path.parents


def file_record(root, name):
    path = root / name
    if path.is_symlink():
        data = os.fsencode(os.readlink(path))
        kind = 'symlink'
    elif path.is_file():
        data = path.read_bytes()
        kind = 'file'
    else:
        data = b''
        kind = 'missing' if not path.exists() else 'directory'
    return {'path': name, 'kind': kind, 'sha256': hashlib.sha256(data).hexdigest(),
            'executable': bool(path.lstat().st_mode & 0o111) if path.exists() else False}


def collect(root, mode, base, paths, excluded):
    skip = lambda p: any(inside(p.absolute(), Path(x)) for x in excluded)
    head = merge_base = base_sha = None
    patch = b''
    if mode == 'files':
        names = set()
        for name in paths:
            target = (root / name).absolute()
            if not inside(target, root) or '..' in Path(name).parts:
                raise ValueError('Review paths must stay within the project root')
            if target.is_symlink() or not inside(target.resolve(), root):
                raise ValueError('Explicit file-set paths cannot follow symlinks outside the project')
            if not target.exists():
                raise ValueError('Review path does not exist: ' + name)
            if target.is_dir():
                for folder, dirs, files in os.walk(target, followlinks=False):
                    dirs[:] = sorted(d for d in dirs if d not in {'.git', '.afm', 'node_modules', '__pycache__'}
                                     and not skip(Path(folder) / d))
                    names.update(str((Path(folder) / f).relative_to(root)) for f in files
                                 if not skip(Path(folder) / f))
            elif not skip(target):
                names.add(str(target.relative_to(root)))
    else:
        top = Path(os.fsdecode(git(root, 'rev-parse', '--show-toplevel')).strip()).resolve()
        if root != top:
            raise ValueError('--root must be the Git repository root: ' + str(top))
        head = git(root, 'rev-parse', '--verify', 'HEAD').decode().strip()
        untracked = [os.fsdecode(x) for x in git(root, 'ls-files', '--others', '--exclude-standard', '-z').split(b'\0') if x]
        untracked = [x for x in untracked if not skip(root / x)]
        dirty = git(root, 'diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z', 'HEAD', '--')
        if mode == 'branch':
            if dirty or untracked:
                raise ValueError('Branch review requires a clean checkout; choose uncommitted or arrange it yourself')
            if not base or base.startswith('-'):
                raise ValueError('Branch review requires a valid --base ref')
            base_sha = git(root, 'rev-parse', '--verify', base + '^{commit}').decode().strip()
            merge_base = git(root, 'merge-base', base_sha, head).decode().strip()
            revisions = [merge_base, head]
        else:
            revisions = [head]
        names = {os.fsdecode(x) for x in git(root, 'diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z',
                                            *revisions, '--').split(b'\0') if x}
        patch = git(root, 'diff', '--no-ext-diff', '--no-textconv', '--binary', '--no-renames', *revisions, '--')
        if mode == 'uncommitted':
            names.update(untracked)
            for name in sorted(untracked):
                path = root / name
                if path.is_symlink():
                    text = 'Symlink -> ' + os.readlink(path)
                elif path.is_file():
                    data = path.read_bytes()
                    try:
                        text = data.decode('utf-8')
                        if '\0' in text:
                            raise UnicodeError()
                    except UnicodeError:
                        text = 'Binary untracked file; sha256=' + hashlib.sha256(data).hexdigest() + '\n'
                else:
                    text = 'Untracked non-regular entry\n'
                patch += ('\n' + ''.join(difflib.unified_diff([], text.splitlines(keepends=True),
                                                            fromfile='/dev/null', tofile='b/' + name))).encode('utf-8')
    records = [file_record(root, name) for name in sorted(names)]
    state = {'head': head, 'base_commit': base_sha, 'merge_base': merge_base, 'files': records,
             'patch_sha256': hashlib.sha256(patch).hexdigest()}
    # Metadata and the patch detect edits, index changes that alter scope, and new files.
    fingerprint = hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()
    return state, patch, fingerprint


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action')
    check = sub.add_parser('check', help='Fail if the recorded review candidate changed')
    check.add_argument('--scope', required=True, type=Path)
    parser.add_argument('--root', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--mode', choices=['branch', 'uncommitted', 'files'])
    parser.add_argument('--base')
    parser.add_argument('--path', action='append', default=[])
    args = parser.parse_args()
    try:
        if args.action == 'check':
            saved = json.loads(args.scope.read_text())
            _, _, fingerprint = collect(Path(saved['root']), saved['mode'], saved['base'],
                                         saved['paths'], saved['excluded'])
            if fingerprint != saved['fingerprint']:
                raise ValueError('Review candidate changed; coverage is incomplete. Do not silently recapture.')
            print('Review candidate unchanged')
            return
        if not args.root or not args.output or not args.mode:
            parser.error('--root, --output and --mode are required for capture')
        if args.mode == 'files' and not args.path:
            parser.error('--mode files requires at least one --path')
        root, output = args.root.resolve(), args.output.resolve()
        if not root.is_dir():
            raise ValueError('Project root must be an existing directory')
        if output == root or inside(root, output):
            raise ValueError('Artifact output must not contain the project root')
        if (output / 'scope.json').exists():
            raise ValueError('Scope already captured; use check or explicitly choose a new artifact directory')
        excluded = [str(output.parent if inside(output.parent, root) and output.parent != root else output)]
        state, patch, fingerprint = collect(root, args.mode, args.base, args.path, excluded)
        output.mkdir(parents=True, exist_ok=True)
        (output / 'changes.patch').write_bytes(patch)
        (output / 'files.json').write_text(json.dumps(state['files'], ensure_ascii=True, indent=2) + '\n')
        scope = {'root': str(root), 'mode': args.mode, 'base': args.base, 'paths': args.path,
                 'excluded': excluded, 'head': state['head'], 'base_commit': state['base_commit'],
                 'merge_base': state['merge_base'],
                 'fingerprint': fingerprint, 'file_count': len(state['files']),
                 'untracked_included': args.mode == 'uncommitted'}
        (output / 'scope.json').write_text(json.dumps(scope, indent=2) + '\n')
        print(json.dumps(scope, indent=2))
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, 'review scope: ' + str(exc) + '\n')


if __name__ == '__main__':
    main()
