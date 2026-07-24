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

Locally, one command does everything (bundle the game, generate icons, build &
sign) inside Docker — and hands every file back to your user, so it **never
leaves root-owned files** behind:

```bash
./android-app/build-local.sh 1.0.1 4        # versionName versionCode
```

It reads the keystore password from `$ADFC_STOREPASS` (else prompts) and caches
the SDK/Gradle in `~/.cache/adfreecell-android`, so only the first run downloads
them. The signed `.aab`/`.apk` land in `../store/`.

> Why no root-owned files: the container must run as root (for `apt`), but its
> `docker-build.sh` `trap`s EXIT and `chown`s the working tree back to
> `$HOST_UID:$HOST_GID` on the way out. If you ever prefer builds that never
> touch your machine at all, use the GitHub Actions workflow instead.
