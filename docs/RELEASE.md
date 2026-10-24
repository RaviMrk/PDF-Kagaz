# Release guide — PDF Toolkit (Android)

This guide covers what the code already does for a Play Store release, what only you can do
(accounts, keys, Play Console), how to build, and what still has to be checked on real phones.
Numbers marked "filled by Task 11" come from the M6 release smoke run.

## Code-side checklist

Status of each `docs/REQUIREMENTS.md` §10.2 item. "Code ready" means the app side is done and the
rest is a user action below.

| §10.2 item | Status |
| --- | --- |
| P0 acceptance criteria on a real Android 11+ and Android 9 device | Emulator smoke: filled by Task 11. Real devices: user action (see [Known limitations](#known-limitations)) |
| Denying All Files Access still gives a working app (SAF mode) | Code ready (SafProvider, `play-saf` variant). Smoke: filled by Task 11 |
| Low-RAM phone (≤ 3 GB) with the 50 MB fixture | User action (physical device) |
| Test ad IDs replaced with production IDs; UMP consent in EU test mode | Code ready: the `production` profile sets `APP_ENV=production`, and `app.config.ts` refuses to build without three well-formed, non-test AdMob IDs. EEA test mode: `ADS_DEBUG_GEOGRAPHY=EEA` on a non-production build. Real IDs: user action |
| Privacy policy URL live | Code ready (`PRIVACY_POLICY_URL` → Settings → About; a production build fails without an https URL). Hosting the page: user action |
| Data safety form, All Files Access declaration + video, content rating, target audience | User action; the answers and texts are below |
| Store listing | User action |
| Signed AAB from the EAS production profile; internal track first | Code ready (`eas.json`: `production` builds an auto-incremented `app-bundle`; `submit.production.android.track` is `internal`). Upload key + Play App Signing: user action |
| targetSdk 36 and every `.so` passes the 16 KB page-size check | targetSdk/compileSdk 36 set. 16 KB check: filled by Task 11 |

Release hardening in the build itself:

- **No backups.** `android:allowBackup="false"`, `android:fullBackupContent="false"` and
  `android:dataExtractionRules="@xml/data_extraction_rules"` (written by
  `plugins/withBackupRules.js`). The rules exclude every domain (`root`, `file`, `database`,
  `sharedpref`, `external`) from both `<cloud-backup>` and `<device-transfer>`: Android 12+ ignores
  `allowBackup=false` for device-to-device transfer. The file index holds content URIs and URI
  grants that are invalid on another install, so restoring it would be wrong.
- **R8 minify and resource shrinking** in release builds (`expo-build-properties`
  `enableMinifyInReleaseBuilds`, `enableShrinkResourcesInReleaseBuilds`).
- **Debug and verbose logs stripped.** `-assumenosideeffects class android.util.Log { d, v }`
  removes every `Log.d`/`Log.v` call in app and library code. This removes react-native-pdf's
  `PdfView` lines, which logged the open file's path.
- **Extra keep rules** (`app.json` → `extraProguardRules`), each one needed or justified:
  - `-keep class org.wonday.pdf.** { *; }` — react-native-pdf ships no consumer ProGuard rules, and
    its view manager, Fabric delegate and event classes are reached through React Native's
    registries. Keeping the package is the safe default for the reader; it costs a few KB.
  - `-keep class io.legere.pdfiumandroid.** { *; }` — PdfiumAndroid's classes are called from its
    JNI library by name. The AAR's own `proguard.txt` already has this rule; it is repeated so the
    viewer keeps working if the consumer rules are ever dropped.
  - `-keep class com.google.firebase.crashlytics.FirebaseCrashlytics { public static ** getInstance(); public void setCrashlyticsCollectionEnabled(java.lang.Boolean); }`
    — pdf-native reaches these two members by reflection (Firebase is optional) to apply a crash
    report opt-out immediately. Without Firebase the rule matches nothing.
  - All other libraries (Expo modules, React Native, Reanimated/Worklets, Nitro + MMKV, Google
    Mobile Ads, UMP, ML Kit, Firebase) ship consumer rules or `@Keep`/`@DoNotStrip` annotations,
    and the minified build passed a crash check on Pixel_Fold_API_34 and Pixel_10a (reader, merge,
    ML Kit scanner, photo picker, Settings, banner ad) with no `ClassNotFoundException`,
    `NoSuchMethodError` or fatal exception.
- Native (C/C++) logs are not affected by R8: PdfiumAndroid still prints `jniPdfium` init/destroy
  lines, which hold no paths.

## User actions

Everything here needs your accounts or keys, so the code cannot do it.

### Accounts, IDs and files

1. **Final app name and package ID.** The build uses "PDF Toolkit" and `com.pdfkagaz.pdftoolkit`
   (`app.json`). The package ID can never change after the first Play upload, so decide before it.
2. **AdMob.** Create the AdMob account and the Android app, then one adaptive banner unit and one
   interstitial unit. Store the three IDs as EAS environment variables for the `production`
   environment (see [Build](#build)). The app ID looks like `ca-app-pub-<digits>~<digits>`, the
   unit IDs like `ca-app-pub-<digits>/<digits>`; anything else, or Google's test publisher
   `ca-app-pub-3940256099942544`, fails the build on purpose.
3. **UMP / GDPR message.** In AdMob → Privacy & messaging, create and publish a GDPR (European
   regulations) message for the app, and the US state regulations message if you serve the US.
   Without a published message, UMP shows nothing and EEA users get no ads.
4. **Firebase (optional, for Crashlytics and Analytics).** Create the Firebase project and Android
   app with the final package ID, download `google-services.json`, and store it as the EAS **file**
   variable `GOOGLE_SERVICES_JSON`. Without it the build has no Firebase code at all and telemetry
   is a no-op. Never commit the file (it is git-ignored).
5. **Privacy policy.** Host a page that says: all PDF processing happens on the device and no file
   content or file names are uploaded; the app shows ads through Google AdMob (advertising ID, and
   consent through Google's UMP in the EEA/UK); optional crash reports (Firebase Crashlytics) and
   anonymous usage counts (Firebase Analytics) that the user can turn off in Settings; the document
   scanner is Google Play services' ML Kit scanner. Store the URL as `PRIVACY_POLICY_URL`.
6. **Upload key and Play App Signing.** Let EAS generate and hold the upload keystore
   (`eas credentials -p android`) or upload your own, and enrol in Play App Signing when you create
   the app in Play Console. Back up the upload key; Google can reset it, but only after a support
   request.

### Play Console

1. **Create the app**, then upload the first AAB to the **internal testing** track
   (`eas submit -p android --profile production`, or upload the `.aab` by hand).
2. **Data safety form** — answers in [Data safety notes](#data-safety-notes).
3. **All Files Access declaration** — text and video shot list in
   [All Files Access declaration](#all-files-access-declaration). If it is rejected, ship the
   `production-saf` build instead (no `MANAGE_EXTERNAL_STORAGE`; the user adds folders).
4. **Content rating** questionnaire (IARC): a utility app with no user-generated content, no
   violence, no gambling; mention that it shows ads. The ads request content rated PG
   (`maxAdContentRating`).
5. **Target audience**: 18+ or 13+ (not children). The ads are configured with
   `tagForChildDirectedTreatment: false`, which is only valid when the app does not target children.
6. **Ads declaration**: "Yes, my app contains ads".
7. **Store listing**: app name, short description (≤ 80 characters), full description, at least
   2 (recommended 8) phone screenshots, a 1024×500 feature graphic and a 512×512 icon.
8. **Advertising ID declaration**: the app uses the advertising ID for advertising (AdMob).

### Legal check of the licence notices

Settings → About → Open-source licences lists the npm packages (`src/config/licenses.json`, made by
`scripts/make-licenses.mjs`) and the Android libraries (`src/config/nativeNotices.ts`). Before
release, have someone check:

- The Android library groups and their licences in `nativeNotices.ts` were assigned by hand from
  each project's POM or repository. Re-check them against
  `cd android && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath` after any
  dependency change.
- Where a package ships no licence file, the generator falls back to the standard SPDX text from
  `scripts/spdx/`. Those fallback texts have no copyright line for the author.

## Build

```sh
# Store the IDs once per EAS project (environment: production)
eas env:create --environment production --name ADMOB_ANDROID_APP_ID --value 'ca-app-pub-…~…' --visibility sensitive
eas env:create --environment production --name ADMOB_BANNER_ID --value 'ca-app-pub-…/…' --visibility sensitive
eas env:create --environment production --name ADMOB_INTERSTITIAL_ID --value 'ca-app-pub-…/…' --visibility sensitive
eas env:create --environment production --name PRIVACY_POLICY_URL --value 'https://…' --visibility plaintext
eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret

# Play build with All Files Access
eas build -p android --profile production

# Fallback build without All Files Access (if the declaration is rejected)
eas build -p android --profile production-saf

# Upload to the internal testing track
eas submit -p android --profile production
```

- `production` sets `APP_ENV=production`; `production-saf` extends it and adds
  `APP_VARIANT=play-saf`. `preview` sets `APP_ENV=preview` and always uses Google's test ad IDs.
- With `APP_ENV=production`, `app.config.ts` throws "Production build needs real AdMob IDs" when
  any of the three IDs is missing, malformed or a Google test ID. It also throws "Production build needs
  PRIVACY_POLICY_URL set to an https:// URL" when the URL is missing or not https. It also ignores
  `ADS_DEBUG_GEOGRAPHY` and `ADS_TEST_DEVICE_IDS`.
- Local release build (debug-keystore signed, for testing only):

  ```sh
  export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.20.1+1/Contents/Home
  export ANDROID_HOME=~/Library/Android/sdk
  npx expo prebuild --platform android --clean
  cd android && ./gradlew assembleRelease bundleRelease
  ```

## Data safety notes

Answers for the Play Console data safety form. Re-check them whenever Firebase is enabled or
disabled.

- **On-device processing.** PDFs, images and scans are processed on the device. File content,
  file names, paths and typed text are never sent anywhere. Telemetry events hold only enums and
  numbers from a closed schema (tool, result, failure kind, rounded duration, input count, page
  bucket).
- **Ads (Google Mobile Ads SDK + UMP).** Collected and shared with Google for advertising,
  analytics and fraud prevention: device or other IDs (advertising ID, app set ID), app
  interactions with ads, diagnostics (crash and performance data of the SDK), and approximate
  location derived from the IP address, as Google describes for the Mobile Ads SDK. Ads are
  personalised only with consent in the EEA/UK (UMP).
- **Firebase Analytics (only when `google-services.json` is supplied).** App interactions
  (`first_open`, `session_start` and other automatic events, and the app's `tool_finished` event)
  and the app-instance ID. Advertising-ID and SSAID collection and automatic screen reporting are
  off. Optional: the user can turn it off in Settings, and it is off while ads consent does not
  allow it.
- **Firebase Crashlytics (only when enabled).** Crash logs and diagnostics (stack traces, device
  model, OS version, a Crashlytics installation ID). No custom logs or keys. Optional: the user can
  turn it off in Settings.
- **ML Kit document scanner (Google Play services).** The scanning itself runs on the device. The
  ML Kit and Firebase components (`transport-*`, `firebase-components`) send Google anonymous API
  usage and performance counts (which feature ran, how long it took, errors), without image
  content. Declare it under diagnostics/app performance.
- **Encrypted in transit:** yes (all SDK traffic is HTTPS). **Deletion request:** no user account
  and no server-side user data held by the app itself.
- **Release permissions** (merged release manifest of the Task 10 build, `aapt dump permissions`,
  default variant without Firebase; Task 11 confirms on its build):
  - Ads SDK: `INTERNET`, `ACCESS_NETWORK_STATE`, `com.google.android.gms.permission.AD_ID`,
    `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_ADSERVICES_TOPICS`,
    `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`.
  - Storage: `MANAGE_EXTERNAL_STORAGE` (not in `production-saf`), `READ_EXTERNAL_STORAGE`
    (max SDK 32), `WRITE_EXTERNAL_STORAGE`.
  - Background work: `WAKE_LOCK`, `FOREGROUND_SERVICE`.
  - The app's own `com.pdfkagaz.pdftoolkit.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (AndroidX).
  - Not present: `CAMERA`, `READ_MEDIA_*`, `SYSTEM_ALERT_WINDOW`, `ACCESS_WIFI_STATE`,
    `DOWNLOAD_WITHOUT_NOTIFICATION`, `VIBRATE`.

### Privacy notes for the policy and for support

- The JavaScript error scrubber removes paths, URIs and file names from JS error messages before
  they reach Crashlytics. **Uncaught native or third-party exceptions are not scrubbed**: their
  messages go to Crashlytics as the library wrote them. The app's own native errors use fixed
  strings with no file names.
- Crash reports written while the user has crash reports turned off are deleted, not sent:
  turning them off calls `deleteUnsentReports()`. The off setting is stored natively and applied
  by Firebase's init provider before the app's code runs, so nothing is sent at the next start
  before the app re-applies the user's choice.
- Turning crash reports off also takes effect at once in the running process.
  `@react-native-firebase/crashlytics` only stores the setting for the next start, so the app
  additionally calls `FirebaseCrashlytics.setCrashlyticsCollectionEnabled(false)` through
  pdf-native (`disableCrashlyticsNow`, by reflection, a no-op without Firebase) before deleting the
  unsent reports. A native crash later in that session is only stored on disk and is deleted at the
  next start. Residual: a crash in the few milliseconds between the tap and that native call. After
  turning crash reports back on, collection resumes at the next start.

## All Files Access declaration

**Justification (one paragraph):**

> PDF Toolkit is a document manager for PDF files. Its core feature is a library that finds every
> PDF on the phone — in Downloads, messaging-app folders, Documents and on SD cards — and lists
> them in one place so the user can open, organise, merge, split and convert them. PDFs arrive in
> many app-specific folders that the Storage Access Framework cannot list as a whole, so asking the
> user to pick each folder would leave most documents missing. The app reads only PDF files, does
> all processing on the device and never uploads file content or names. Users who decline All
> Files Access can still pick individual folders through the system folder picker.

**Demo video shot list (30–60 s, screen recording):**

1. Fresh install → onboarding → the explanation screen for All Files Access.
2. Tap "Allow" → the system Settings toggle → back in the app.
3. The Files tab fills with PDFs from Download, WhatsApp Documents and Documents.
4. Open one PDF from the list in the reader.
5. Run one tool (merge two of the found PDFs) and show the result saved to `Documents/PDFToolkit`.
6. Settings → storage access shows the folder-picker alternative for users who decline.

## Size

| Build (arm64-v8a) | Before R8 | After R8 + resource shrinking |
| --- | --- | --- |
| Release APK | 62 635 750 B (59.7 MiB) | 51 822 864 B (49.4 MiB) |
| AAB download size for an arm64 phone (`bundletool get-size total`, API 34, 420 dpi, `en`) | 37 065 533 B (35.3 MiB) | 26 488 623 B (25.3 MiB) |

Measured by Task 10 on arm64-only builds (`-PreactNativeArchitectures=arm64-v8a`, Firebase not
linked). Play delivers per-ABI and per-density splits from the AAB, so the download size is what an
arm64 phone gets; it is under the §4 40 MB target. The universal APK stays above it because it
carries every density and language. R8 also removed all 534 `Log.d`/`Log.v` call sites from the
dex (0 left).

Task 11's final numbers: filled by Task 11.

## Known limitations

These need a physical phone and are not covered by the emulator runs:

- All P0 acceptance criteria on a real Android 11+ phone and a real Android 9 phone (§10.2).
- Share and print on **Android 7–10** (API 24–29): the shareable-path check is alias-tolerant but
  was verified only on API 34.
- A **low-RAM phone (≤ 3 GB)** with the 50 MB scanned fixture: open, scroll, merge and split
  without an out-of-memory crash.
- **Real-camera scan** on Android 11+ and on Android 9 (the emulator uses a virtual scene).
- **No Play services / offline first run**: the scanner reports that it is unavailable, the app
  opens without ads and every other tool works.
- **Photo picker fallback on API 24–29** (no system photo picker; the documents picker is used).
- **HEIC photos on a Samsung phone** in Images to PDF.
- **100 real 12 MP photos** in Images to PDF: time and peak memory (the emulator runs used
  2400×1800 images).
- **Merge and split under 10 s** on a mid-range phone (emulator: 9–14 s on Pixel_10a API 37 with
  software rendering, 3.5–5.7 s on the Fold API 34).

## Developer notes

- `npm run typecheck` checks typed routes against `.expo/types/router.d.ts`. After adding,
  removing or renaming a route, regenerate it by starting Metro once (`npx expo start`, then quit)
  or the typecheck reports unknown routes.
