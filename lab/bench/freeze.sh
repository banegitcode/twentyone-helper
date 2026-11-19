#!/usr/bin/env bash
# Freeze a bench candidate so later edits cannot change a running or queued test.
# Usage: bench/freeze.sh <name> <path>
#   name  short label, e.g. exact-endgame-deeper or champion
#   path  candidate file or directory (absolute, or relative to the lab root or cwd)
#
# Copies the candidate tree and the engine files it loads into
#   bench/frozen/<name>@<shortsha>/
# as a read-only snapshot (21lab-relative layout so relative requires still work),
# writes MANIFEST.json, and points bench/frozen/<name> at the new snapshot.
set -euo pipefail

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ]; then
  echo "usage: $0 <name> <path>" >&2
  exit 2
fi
NAME=$1
SRC_IN=$2

HERE=$(cd "$(dirname "$0")" && pwd)
LAB=$(cd "$HERE/.." && pwd)
FROZEN_ROOT="$HERE/frozen"

if [ -d "$SRC_IN" ] || [ -f "$SRC_IN" ]; then
  SRC=$(cd "$(dirname "$SRC_IN")" && pwd)/$(basename "$SRC_IN")
elif [ -d "$LAB/$SRC_IN" ] || [ -f "$LAB/$SRC_IN" ]; then
  SRC="$LAB/$SRC_IN"
elif [ -d "$HERE/$SRC_IN" ] || [ -f "$HERE/$SRC_IN" ]; then
  SRC="$HERE/$SRC_IN"
else
  echo "freeze.sh: path not found: $SRC_IN" >&2
  exit 1
fi
[ -f "$SRC" ] && SRC=$(dirname "$SRC")

# Resolve a path under $LAB to a relative path; otherwise use the basename.
rel_under_lab() {
  local p=$1
  case "$p" in
    "$LAB"/*) echo "${p#"$LAB"/}" ;;
    *) echo "external/$(basename "$p")" ;;
  esac
}

TMP=$(mktemp -d "$HERE/.freeze.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
STAGE="$TMP/tree"
mkdir -p "$STAGE"

copy_tree() {
  local src=$1 dest=$2
  mkdir -p "$dest"
  # rsync-like: skip bulky or generated dirs that the policy does not load.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.git/' --exclude '__pycache__/' --exclude 'node_modules/' \
      --exclude 'target/' --exclude 'scratch/' --exclude 'results/cache/' \
      --exclude 'results/logs/' --exclude 'results/smoke/' --exclude 'results/smoke_p/' \
      --exclude 'results/void/' --exclude '*.pyc' \
      "$src"/ "$dest"/
  else
    (cd "$src" && find . -type f \
      ! -path './.git/*' ! -path '*/__pycache__/*' ! -path '*/node_modules/*' \
      ! -path '*/target/*' ! -path '*/scratch/*' ! -name '*.pyc' \
      -print0 | tar --null -T - -cf -) | (cd "$dest" && tar -xf -)
  fi
}

# Candidate
REL_CAND=$(rel_under_lab "$SRC")
copy_tree "$SRC" "$STAGE/$REL_CAND"

# Engine files loaded by this candidate (JS adapters resolve ENGINE via
# ../../engine/twentyone-solver or ../../../engine/twentyone-solver/src, or
# CHAMPION_DIR / TWENTYONE_SRC). Always include the engine if the candidate
# references it.
needs_engine=0
if grep -Rql --exclude-dir=results --exclude-dir=ref --exclude='*.md' \
     -e 'twentyone-solver' -e 'CHAMPION_DIR' -e 'TWENTYONE_SRC' -e 'ENGINE_SRC' \
     "$SRC" 2>/dev/null; then
  needs_engine=1
fi
# champion_adapter and this lab's experiment adapters always need the engine.
case "$REL_CAND" in
  bench/champion*|experiments/*) needs_engine=1 ;;
esac
if [ "$needs_engine" = 1 ] && [ -d "$LAB/engine/twentyone-solver" ]; then
  copy_tree "$LAB/engine/twentyone-solver" "$STAGE/engine/twentyone-solver"
fi

# Content hash of every staged file (stable: sorted paths, sha256 of bytes).
# shortsha is the first 12 hex chars of the tree hash.
TREE_HASH=$( (
  cd "$STAGE"
  find . -type f ! -name MANIFEST.json | LC_ALL=C sort | while IFS= read -r f; do
    sha256sum "$f"
  done
) | sha256sum | awk '{print $1}' )
SHORT=${TREE_HASH:0:12}
DEST="$FROZEN_ROOT/${NAME}@${SHORT}"

mkdir -p "$FROZEN_ROOT"
if [ -d "$DEST" ]; then
  # Already frozen this exact tree. Refresh the symlink and keep the snapshot.
  chmod -R u+w "$DEST" 2>/dev/null || true
fi
mkdir -p "$DEST"
# Replace destination contents with the new stage (should be identical on a re-freeze).
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$STAGE"/ "$DEST"/
else
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -a "$STAGE"/. "$DEST"/
fi

# MANIFEST
manifest_tmp=$(mktemp)
python3 - "$DEST" "$NAME" "$SRC" "$REL_CAND" "$TREE_HASH" "$SHORT" "$LAB" "$manifest_tmp" << 'PY'
import json, os, sys, datetime, hashlib
dest, name, src, rel, tree, short, lab, out = sys.argv[1:]
files = []
for root, dirs, fns in os.walk(dest):
    dirs[:] = [d for d in dirs if d not in (".git",)]
    for fn in fns:
        if fn == "MANIFEST.json":
            continue
        p = os.path.join(root, fn)
        rel_p = os.path.relpath(p, dest)
        h = hashlib.sha256(open(p, "rb").read()).hexdigest()
        files.append({"path": rel_p, "sha256": h, "bytes": os.path.getsize(p)})
files.sort(key=lambda r: r["path"])
# useful entry points
adapters = [f["path"] for f in files if f["path"].endswith(("adapter.js", "adapter2.js", "champion_adapter.js"))]
man = {
    "name": name,
    "shortsha": short,
    "tree_sha256": tree,
    "source": src,
    "source_rel": rel,
    "lab": lab,
    "frozen_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S America/Los_Angeles"),
    "n_files": len(files),
    "entry_points": adapters,
    "files": files,
    "note": "Read-only snapshot. compare.py records frozen_sha in the result JSON. A new edit needs a new freeze.sh invocation, not a rewrite of this directory.",
}
json.dump(man, open(out, "w"), indent=2)
json.dump(man, open(os.path.join(dest, "MANIFEST.json"), "w"), indent=2)
print(os.path.join(dest, "MANIFEST.json"))
PY

# Make the snapshot read-only (files and directories).
chmod -R a-w "$DEST"
# Keep the frozen root itself writable so later snapshots can be added.
chmod u+w "$FROZEN_ROOT"

# Convenience symlink bench/frozen/<name> -> <name>@<shortsha>
ln -sfn "${NAME}@${SHORT}" "$FROZEN_ROOT/${NAME}"

echo "frozen $DEST"
echo "symlink $FROZEN_ROOT/${NAME} -> ${NAME}@${SHORT}"
echo "tree_sha256 $TREE_HASH"
echo "shortsha $SHORT"
# Print a ready-to-use cmd: spec for the main adapter, if any.
if [ -f "$DEST/$REL_CAND/adapter.js" ]; then
  echo "cmd: node $DEST/$REL_CAND/adapter.js --config <config>"
elif [ -f "$DEST/$REL_CAND/champion_adapter.js" ]; then
  echo "cmd: node $DEST/$REL_CAND/champion_adapter.js --config <config>"
fi
