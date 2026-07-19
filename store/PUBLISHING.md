# Publishing adFreeCell to the Google Play Store

adFreeCell ships as a **Trusted Web Activity (TWA)**: a thin Android wrapper
(built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)) around
the PWA hosted on GitHub Pages. The `.aab` is built and signed in GitHub Actions
using your keystore, which you store as an encrypted secret.

## What's in this folder

| File | Purpose |
|------|---------|
| `listing-de.txt`, `listing-en.txt` | Store title, short & full description (within Play's limits) |
| `screenshots/de/`, `screenshots/en/` | German & English shots — phone 2340×1170, 7″ tablet 1920×1200, 10″ tablet 2560×1600 (valid Play ratios) |
| `feature-graphic-de.png`, `feature-graphic-en.png` | 1024×500 feature graphics (German / English) |
| `KEYSTORE-SECRETS.txt` | **git-ignored** — the keystore password + base64 to paste into GitHub secrets |
| `../android/twa-manifest.json` | Bubblewrap config (package `de.tommywurzbacher.adfreecell`, landscape, icons) |
| `../.well-known/assetlinks.json` | Digital Asset Links (see step 4) |
| `../.github/workflows/android-aab.yml` | Builds & signs the `.aab` in CI |
| `../privacy.html` | Privacy policy (served at `…/adFreeCell/privacy.html`) |
| `../adfreecell-upload.jks` | **git-ignored** upload keystore — back this up! |

## 1. Keystore (already generated)

`adfreecell-upload.jks` (alias `upload`) is in the repo root and **git-ignored**.
Its SHA-256 fingerprint and password are in `KEYSTORE-SECRETS.txt`.
**Back the `.jks` up somewhere safe** — losing it means you can never update the
app again.

## 2. Add three GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**
(values are in `KEYSTORE-SECRETS.txt`):

- `ANDROID_KEYSTORE_BASE64` — the long base64 line
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

## 3. Build the AAB

GitHub → **Actions → “Build Android AAB (TWA)” → Run workflow** (set the version
name/code; the version code must increase on every upload). When it finishes,
download the **adFreeCell-android** artifact — it contains `app-release-bundle.aab`
(upload this) and a test `.apk`.

## 4. Digital Asset Links (so the app runs full-screen, no URL bar)

The app must prove it owns the web content. The verification file has to sit at
the **domain root**, i.e. `https://laserrapt0r.github.io/.well-known/assetlinks.json`
— *not* under `/adFreeCell/`. Add adFreeCell's entry to that file in your
`laserrapt0r.github.io` (user-pages) repo, exactly like you did for Parkplatz.
The entry is in `../.well-known/assetlinks.json`.

**Important — Play App Signing:** if you let Google manage the app signing key
(recommended), the *installed* app is signed with Google's key, not this upload
key. After the first upload, copy the **SHA-256 of the app signing key** from
Play Console → *Test and release → App integrity → App signing* and add it as a
second fingerprint in the domain-root `assetlinks.json`. Until then the app may
show a URL bar.

## 5. Play Console listing

- **App name / short / full description:** copy from `listing-de.txt` (German)
  and `listing-en.txt` (English). Add more languages later if you like.
- **Privacy policy URL:** `https://laserrapt0r.github.io/adFreeCell/privacy.html`
- **Screenshots:** upload from `screenshots/de/` (German listing) and
  `screenshots/en/` (English listing) — the `phone-*` (2340×1170), `tab7-*`
  (1920×1200) and `tab10-*` (2560×1600) images into the phone, 7″ and 10″ tablet
  slots respectively (2–8 each).
- **App icon:** 512×512 — use `../icons/icon-512.png` (or the maskable one).
- **Feature graphic:** 1024×500 — use `feature-graphic-de.png` (German listing)
  and `feature-graphic-en.png` (English listing).
- **Category:** Games → Card. **Contact email:** tommy.wurzbacher@googlemail.com
- Fill in the content rating questionnaire (no objectionable content), data
  safety form (no data collected/shared), and pricing (free).

## 6. Updating later

Bump the **version code** (integer, must increase) and version name, re-run the
workflow, upload the new `.aab`. The `assetlinks.json` and keystore stay the same.
