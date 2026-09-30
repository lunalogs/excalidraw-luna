#!/bin/sh
# Regenerates docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas with
# the exact archive writer the iOS app compiles. Run from anywhere.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/apps/ipad/LunaCanvas/Document/LunaArchive.swift"
DST="$ROOT/scripts/native/FixtureGen/Sources/fixturegen/LunaArchive.swift"
cmp "$SRC" "$DST" || cp "$SRC" "$DST"
cd "$ROOT/scripts/native/FixtureGen"
# note: the SPM binary traps (exit 133) during process teardown AFTER the
# fixture is fully written on macOS 26 / swift 6.2; verify by mtime instead
FIXTURE="$ROOT/docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas"
BEFORE=$(stat -f %m "$FIXTURE" 2>/dev/null || echo 0)
swift run fixturegen "$ROOT" || RC=$?
AFTER=$(stat -f %m "$FIXTURE" 2>/dev/null || echo 0)
if [ "$AFTER" -le "$BEFORE" ]; then
  echo "fixture NOT regenerated (exit ${RC:-0})" >&2
  exit 1
fi
echo "fixture regenerated: $FIXTURE"
