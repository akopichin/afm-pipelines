#!/bin/sh
set -eu

stage_dir=${1:?Usage: setup-strictacode.sh ABSOLUTE_SCOPE_STAGE_DIR}
case "$stage_dir" in
  /*) ;;
  *) echo "Strictacode setup requires an absolute stage directory" >&2; exit 1 ;;
esac
mkdir -p "$stage_dir"

analyzer=$(command -v strictacode || true)
if [ -z "$analyzer" ]; then
  if [ ! -f /.dockerenv ] && [ ! -f /run/.containerenv ] && [ "${AFM_IN_DOCKER:-}" != 1 ]; then
    echo "strictacode is missing on this host. Install strictacode==0.0.12 in your Python environment, then Retry hook." >&2
    exit 1
  fi
  command -v python3 >/dev/null || {
    echo "Strictacode setup requires Python 3 in the container" >&2
    exit 1
  }
  venv="$stage_dir/tools/strictacode"
  analyzer="$venv/bin/strictacode"
  if [ ! -x "$analyzer" ] || ! "$analyzer" --help >/dev/null 2>&1; then
    echo "Installing strictacode==0.0.12 into the run's Python environment: $venv"
    python3 -m venv "$venv"
    if command -v uv >/dev/null 2>&1; then
      UV_CACHE_DIR="$stage_dir/tools/uv-cache" uv pip install --python "$venv/bin/python" strictacode==0.0.12
    else
      "$venv/bin/python" -m pip install --disable-pip-version-check strictacode==0.0.12
    fi
  fi
fi

if ! "$analyzer" --help >/dev/null; then
  echo "Strictacode was found but cannot run: $analyzer" >&2
  exit 1
fi
printf '%s\n' "$analyzer" > "$stage_dir/strictacode-command.txt.tmp"
mv "$stage_dir/strictacode-command.txt.tmp" "$stage_dir/strictacode-command.txt"
echo "Strictacode ready: $analyzer"
