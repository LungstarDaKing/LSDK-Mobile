#!/usr/bin/env bash
# Build an "update zip" with only the files that changed since a tag/commit, plus REMOVED.txt for deleted files.
# Usage: scripts/make-update.sh <from-tag> <output.zip>   (run from the project root)
set -euo pipefail
from="${1:?from tag/commit}"; out="$(realpath -m "${2:?output zip}")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/LSDKMobile"
git diff --name-only --diff-filter=ACMR "$from" HEAD | while IFS= read -r f; do mkdir -p "$tmp/LSDKMobile/$(dirname "$f")"; cp "$f" "$tmp/LSDKMobile/$f"; done
git diff --name-only --diff-filter=D "$from" HEAD > "$tmp/LSDKMobile/REMOVED.txt"
changed_deps=$(git diff --name-only "$from" HEAD | grep -E '^package(-lock)?\.json$' || true)
{
  echo "Update from $from to $(git rev-parse --short HEAD)"
  echo "1. Extract this zip over your LSDKMobile folder (allow overwrite)."
  echo "2. Delete every file listed in REMOVED.txt (if it is empty, nothing to delete)."
  [ -n "$changed_deps" ] && echo "3. package.json changed: run  npm ci"
  [ -n "$(git diff --name-only "$from" HEAD | grep -E '^app\.json$|^plugins/' || true)" ] && echo "4. app.json changed: delete the ios/ and android/ folders if you have them (they are regenerated), and make a new dev build."
} > "$tmp/LSDKMobile/UPDATE-README.txt"
rm -f "$out"; (cd "$tmp" && zip -qr "$out" LSDKMobile)
echo "wrote $out"; unzip -l "$out" | tail -1
