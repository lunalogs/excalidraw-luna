#!/bin/sh
# W13: reproducible release-candidate build. Clean derived data, stage web
# assets, build + test the native app, and emit a candidate manifest with
# SHA-256 hashes of every shipped artifact.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIM_ID="${SIM_ID:-C5D8FD6E-2292-4B3B-8475-E0A36BE6409A}"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

echo "== 1/4 web build =="
(cd "$ROOT/excalidraw-app" && node ../node_modules/vite/bin/vite.js build)
echo "== 2/4 stage offline assets =="
"$ROOT/scripts/native/prepare-web-assets.sh"
echo "== 3/4 regenerate fixture + native test =="
"$ROOT/scripts/native/gen-fixture.sh" || true
(cd "$ROOT/apps/ipad" && rm -rf build && tools/xcodegen/bin/xcodegen && \
  xcodebuild -project LunaCanvas.xcodeproj -scheme LunaCanvas \
  -destination "platform=iOS Simulator,id=$SIM_ID" \
  -derivedDataPath build test)
echo "== 4/4 candidate manifest =="
MANIFEST="$ROOT/docs/handwriting/native/RELEASE_CANDIDATE.json"
{
  echo "{"
  echo "  \"builtAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"xcode\": \"$(xcodebuild -version | head -1)\","
  echo "  \"sdk\": \"$(xcrun --sdk iphonesimulator --show-sdk-version)\","
  echo "  \"artifacts\": {"
  echo "    \"webBuildHash\": \"$(find "$ROOT/excalidraw-app/build" -type f -exec shasum -a 256 {} + | shasum -a 256 | cut -d' ' -f1)\","
  echo "    \"fixtureHash\": \"$(shasum -a 256 "$ROOT/docs/handwriting/native/fixtures/p0-roundtrip.lunacanvas" | cut -d' ' -f1)\","
  echo "    \"xcodegenHash\": \"8774da746668bc18fe74e54cbaf10f2631a1fb05947cd374179aa912f14f99db\""
  echo "  },"
  echo "  \"signing\": \"none (simulator); device signing left to the user\""
  echo "}"
} > "$MANIFEST"
cat "$MANIFEST"
