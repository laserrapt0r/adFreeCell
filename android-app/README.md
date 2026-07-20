# adFreeCell — fully offline Android app

A minimal **WebView** wrapper that bundles the whole game inside the APK, so it
works **100% offline** with **no `INTERNET` permission** and no dependency on
GitHub Pages. (The alternative TWA build in [`../android/`](../android/) instead
loads the game live from the web.)

## How it works

- [`MainActivity.java`](app/src/main/java/de/tommywurzbacher/adfreecell/MainActivity.java)
  shows one full-screen `WebView` and serves the game from the APK's `assets/`
  via `WebViewAssetLoader` over `https://appassets.androidplatform.net/…`. That
  virtual origin also gives `localStorage` a stable home, so settings, stats and
  the current game persist.
- The game files (`index.html`, `css/`, `js/`, `icons/`, …) are **copied into
  `app/src/main/assets/` at build time** from the repo root — they are not
  duplicated in git (see `.gitignore`).
- Launcher icons are generated from [`../icons/`](../icons/) at build time.
- `AndroidManifest.xml` intentionally declares **no permissions at all**.

## Build

Easiest: run the **“Build Offline Android app (WebView)”** GitHub Actions
workflow ([`../.github/workflows/android-offline.yml`](../.github/workflows/android-offline.yml)),
which sets the version, decodes the keystore secret and signs the `.aab`.

Locally (needs a JDK 17 + Android SDK; the wrapper fetches Gradle):

```bash
# from the repo root: copy the game in + generate icons first (the CI workflow
# shows the exact commands), then, in android-app/:
ADFC_KEYSTORE=$PWD/../adfreecell-upload.jks ADFC_STOREPASS=… ADFC_KEYALIAS=upload \
  ./gradlew -PversionName=1.0.1 -PversionCode=2 :app:bundleRelease :app:assembleRelease
```

Outputs land in `app/build/outputs/` (`bundle/release/app-release.aab`,
`apk/release/app-release.apk`).
