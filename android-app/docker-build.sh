#!/usr/bin/env bash
# Runs INSIDE the Docker container (as root) to build the offline WebView APK/AAB.
# Its final act hands every file it created back to the host user (HOST_UID/GID),
# so a Docker build never leaves root-owned files in your working tree.
set -e
export DEBIAN_FRONTEND=noninteractive

# Whatever happens, give the working tree + caches back to the host user on exit.
handback() { chown -R "${HOST_UID:-0}:${HOST_GID:-0}" /work/android-app /sdk2 /root/.gradle 2>/dev/null || true; }
trap handback EXIT

echo "### tools (JDK 17, imagemagick)"
apt-get update -qq >/dev/null 2>&1
apt-get install -y -qq openjdk-17-jdk-headless unzip zip curl imagemagick >/dev/null 2>&1
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# --- Android SDK (persisted in /sdk2), API 36 ---
export ANDROID_HOME=/sdk2/android-sdk ANDROID_SDK_ROOT=/sdk2/android-sdk
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -sSL -o /tmp/ct.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q /tmp/ct.zip -d "$ANDROID_HOME/cmdline-tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"; mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
SDKMGR="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMGR" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 || true
[ -d "$ANDROID_HOME/build-tools/36.0.0" ] || \
  "$SDKMGR" --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null 2>&1

cd /work/android-app

echo "### bundling the game into app/src/main/assets/"
A=app/src/main/assets
rm -rf "$A"; mkdir -p "$A"
cp /work/index.html /work/manifest.webmanifest /work/privacy.html "$A/"
cp -r /work/css /work/js /work/icons "$A/"

echo "### generating launcher icons"
gen() { mkdir -p "app/src/main/res/mipmap-$1"; convert "$2" -resize "$3x$3" "app/src/main/res/mipmap-$1/$4"; }
for d in "mdpi 48" "hdpi 72" "xhdpi 96" "xxhdpi 144" "xxxhdpi 192"; do
  set -- $d; gen "$1" /work/icons/icon-512.png "$2" ic_launcher.png; gen "$1" /work/icons/icon-512.png "$2" ic_launcher_round.png
done
for d in "mdpi 108" "hdpi 162" "xhdpi 216" "xxhdpi 324" "xxxhdpi 432"; do
  set -- $d; gen "$1" /work/icons/icon-maskable-512.png "$2" ic_launcher_foreground.png
done

export ADFC_KEYSTORE=/work/adfreecell-upload.jks ADFC_KEYALIAS=upload
export ADFC_STOREPASS="$STOREPASS" ADFC_KEYPASS="$STOREPASS"

echo "### gradle build (release AAB + APK)"
chmod +x gradlew
./gradlew --no-daemon --console=plain \
  -PversionName="${VNAME:-1.0.1}" -PversionCode="${VCODE:-4}" \
  :app:bundleRelease :app:assembleRelease

echo "### artifacts:"
ls -la app/build/outputs/bundle/release/*.aab app/build/outputs/apk/release/*.apk 2>/dev/null || echo "no artifacts"
