#!/bin/sh
# W13/0050: reproducible release-candidate build. Clean derived data, stage
# web assets, regenerate the cross-end fixture through the XCTest writer,
# build + test the native app, and emit a candidate manifest with the
# source SHA, sorted RELATIVE-path artifact hashes, and workspace summary.
#
# 0050-R7 hardening: any failed step fails the build (no swallowed
# errors); hashes use deterministic sorted relative paths (reproducible
# across machines); the manifest records source + native app identity.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM_ID="${SIM_ID:-C5D8FD6E-2292-4B3B-8475-E0A36BE6409A}"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

# deterministic relative-path hash of a directory tree
tree_hash() {
  (cd "$1" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | tr '\n' '\0' | \
    xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
}

SOURCE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
DIRTY_COUNT="$(git -C "$ROOT" status --porcelain | wc -l | tr -d ' ')"

echo "== 1/5 web build (source $SOURCE_SHA) =="
(cd "$ROOT/excalidraw-app" && node ../node_modules/vite/bin/vite.js build)

echo "== 2/5 stage offline assets =="
"$ROOT/scripts/native/prepare-web-assets.sh"

echo "== 3/5 regenerate fixture via the XCTest writer =="
FIXTURE="$ROOT/docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas"
BEFORE="$(stat -f %m "$FIXTURE")"
echo "$FIXTURE" > /tmp/lunacanvas-fixture-out
trap 'rm -f /tmp/lunacanvas-fixture-out' EXIT
(cd "$ROOT/apps/ipad" && tools/xcodegen/bin/xcodegen --spec project.yml && \
  xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas \
  -destination "platform=iOS Simulator,id=$SIM_ID" \
  -derivedDataPath build test -only-testing:LunaCanvasTests/FixtureWriterTests)
AFTER="$(stat -f %m "$FIXTURE")"
if [ "$AFTER" -le "$BEFORE" ]; then
  echo "fixture NOT regenerated — candidate build FAILED" >&2
  exit 1
fi

echo "== 4/5 full native test =="
(cd "$ROOT/apps/ipad" && rm -rf build && tools/xcodegen/bin/xcodegen --spec project.yml && \
  xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas \
  -destination "platform=iOS Simulator,id=$SIM_ID" \
  -derivedDataPath build test)

echo "== 5/5 candidate manifest =="
APP_PATH="$ROOT/apps/ipad/build/Build/Products/Debug-iphonesimulator/LunaCanvas.app"
if [ ! -d "$APP_PATH" ]; then
  echo "native app bundle missing at $APP_PATH — candidate build FAILED" >&2
  exit 1
fi
XCODEGEN_HASH="$(shasum -a 256 "$ROOT/apps/ipad/tools/xcodegen/bin/xcodegen" | cut -d' ' -f1)"
MANIFEST="$ROOT/docs/handwriting/native/RELEASE_CANDIDATE.json"
{
  echo "{"
  echo "  \"builtAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"source\": {"
  echo "    \"sha\": \"$SOURCE_SHA\","
  echo "    \"dirtyFiles\": $DIRTY_COUNT,"
  echo "    \"branch\": \"$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)\""
  echo "  },"
  echo "  \"toolchain\": {"
  echo "    \"xcode\": \"$(xcodebuild -version | head -1)\","
  echo "    \"sdk\": \"$(xcrun --sdk iphonesimulator --show-sdk-version)\","
  echo "    \"xcodegenSha256\": \"$XCODEGEN_HASH\""
  echo "  },"
  echo "  \"artifacts\": {"
  echo "    \"webBuildHash\": \"$(tree_hash "$ROOT/excalidraw-app/build")\","
  echo "    \"nativeAppHash\": \"$(tree_hash "$APP_PATH")\","
  echo "    \"fixtureHash\": \"$(shasum -a 256 "$FIXTURE" | cut -d' ' -f1)\""
  echo "  },"
  echo "  \"signing\": \"none (simulator); device signing left to the user\""
  echo "}"
} > "$MANIFEST"
echo "candidate OK:"
cat "$MANIFEST"
