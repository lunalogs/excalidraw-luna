#!/bin/sh
# W07: packages the web build into the app bundle resources for OFFLINE use.
# The app must never depend on a dev server or remote assets (N18/W07).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_BUILD="$ROOT/excalidraw-app/build"
DEST="$ROOT/apps/ipad/LunaCanvas/Resources/Web"

if [ ! -f "$WEB_BUILD/index.html" ]; then
  echo "web build missing — run: cd excalidraw-app && node ../node_modules/vite/bin/vite.js build" >&2
  exit 1
fi
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$WEB_BUILD/." "$DEST/"
# never ship dev-only or source-mapped internals in the app bundle
rm -f "$DEST"/*.map 2>/dev/null || true
echo "web assets staged: $DEST ($(du -sh "$DEST" | cut -f1))"
