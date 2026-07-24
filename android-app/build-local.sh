#!/usr/bin/env bash
# Build the fully-offline WebView APK/AAB locally, in Docker, WITHOUT leaving any
# root-owned files behind (the container hands everything back to you on exit).
#
#   ./android-app/build-local.sh [versionName] [versionCode]
#
# The keystore password is read from $ADFC_STOREPASS, else prompted.
# SDK/Gradle are cached in $ADFC_BUILD_CACHE (default ~/.cache/adfreecell-android)
# so only the first build downloads them.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
VNAME="${1:-1.0.1}"
VCODE="${2:-4}"
CACHE="${ADFC_BUILD_CACHE:-$HOME/.cache/adfreecell-android}"
mkdir -p "$CACHE/sdk" "$CACHE/gradle" 2>/dev/null || true

KEYSTORE="$REPO/adfreecell-upload.jks"
[ -f "$KEYSTORE" ] || { echo "Missing keystore: $KEYSTORE"; exit 1; }

STOREPASS="${ADFC_STOREPASS:-}"
if [ -z "$STOREPASS" ]; then read -rsp "Keystore password: " STOREPASS; echo; fi

# docker needs sudo on this machine; drop --sudo if yours doesn't.
DOCKER="docker"; command -v docker >/dev/null && docker info >/dev/null 2>&1 || DOCKER="sudo -n docker"

echo ">> Building adFreeCell offline  $VNAME (versionCode $VCODE)"
$DOCKER run --rm \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -e STOREPASS="$STOREPASS" -e VNAME="$VNAME" -e VCODE="$VCODE" \
  -v "$REPO":/work \
  -v "$CACHE/sdk":/sdk2 \
  -v "$CACHE/gradle":/root/.gradle \
  -w /work node:18-bookworm bash /work/android-app/docker-build.sh

OUT="$REPO/android-app/app/build/outputs"
DEST="$REPO/store/adFreeCell-$VNAME-offline.aab"
cp "$OUT/bundle/release/app-release.aab" "$DEST"
cp "$OUT/apk/release/app-release.apk"    "$REPO/store/adFreeCell-$VNAME-offline.apk"
echo ">> Done. Upload:  $DEST"
