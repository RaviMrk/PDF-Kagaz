# Release guide — PDF Toolkit (Android)

This guide covers what the code already does for a Play Store release, what only you can do
(accounts, keys, Play Console), how to build, and what still has to be checked on real phones.
Measured numbers come from the M6 release smoke run (Task 11, 2026-10-24).

## Ads are off by default

Ads are switched off for now. The code and `react-native-google-mobile-ads` stay in the app, behind
one build-time flag: `ADS_ENABLED=true` turns ads back on (`app.config.ts` → `extra.ads.enabled`);
anything else, or unset, leaves them off. With ads off:

- No UMP consent call, no `mobileAds().initialize`, no banner (no empty gap) and no interstitial;
  Settings hides "Ad privacy choices".
- A production build needs no real AdMob IDs (the `PRIVACY_POLICY_URL` check still applies). The
  manifest keeps Google's test AdMob app ID, because the linked SDK crashes without one.
- **Analytics stays off.** Analytics consent comes from UMP, and UMP does not run, so the Settings
  analytics switch shows off and cannot be changed. Crash reports keep their own Settings switch.
  The cost: no analytics data until ads return.

To bring ads back, set `ADS_ENABLED=true` (an EAS environment variable for production builds) and
do the AdMob user actions below.

## Code-side checklist

Status of each `docs/REQUIREMENTS.md` §10.2 item. "Code ready" means the app side is done and the
rest is a user action below.

| §10.2 item | Status |
| --- | --- |
| P0 acceptance criteria on a real Android 11+ and Android 9 device | Emulator smoke passed on the minified release build (Pixel_10a API 37 with 16 KB pages, Pixel_Fold_API_34 folded and unfolded); see [Release verification](#release-verification-task-11). Real devices: user action (see [Known limitations](#known-limitations)) |
| Denying All Files Access still gives a working app (SAF mode) | Code ready (SafProvider, `play-saf` variant). Smoke passed: onboarding "Pick folders instead" → Documents → its PDFs listed, merged and opened on Pixel_Fold_API_34 |
| Low-RAM phone (≤ 3 GB) with the 50 MB fixture | User action (physical device) |
| Test ad IDs replaced with production IDs; UMP consent in EU test mode | Code ready: the `production` profile sets `APP_ENV=production`, and `app.config.ts` refuses to build without three well-formed, non-test AdMob IDs. EEA test mode: `ADS_DEBUG_GEOGRAPHY=EEA` on a non-production build; the consent form showed on both emulators. Real IDs: user action |
| Privacy policy URL live | Code ready (`PRIVACY_POLICY_URL` → Settings → About; a production build fails without an https URL). Hosting the page: user action |
| Data safety form, All Files Access declaration + video, content rating, target audience | User action; the answers and texts are below |
| Store listing | User action |
| Signed AAB from the EAS production profile; internal track first | Code ready (`eas.json`: `production` builds an auto-incremented `app-bundle`; `submit.production.android.track` is `internal`). Upload key + Play App Signing: user action |
| targetSdk 36 and every `.so` passes the 16 KB page-size check | targetSdk/compileSdk 36 set. 16 KB check passed: all 29 arm64 `.so` (and the 4 `libcrashlytics*.so` + `libdatastore_shared_counter.so` of a Firebase build) are zip-aligned to 16 KB and every `LOAD` segment is `align 2**14` |

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
- **Storage permission caps kept.** `WRITE_EXTERNAL_STORAGE` is capped at max SDK 29 and
  `READ_EXTERNAL_STORAGE` at 32. Expo's `expo-max-sdk-override-plugin` misreads the manifest-merge
  report and used to strip WRITE's cap from the final manifest (it was uncapped in the M4/M5 APKs).
  `plugins/withStoragePermissions.js` applies `plugins/storage-caps.gradle`, which restores both
  caps in its own merged-manifest transform (it runs after Expo's, whatever Expo's task is called)
  and adds `pdfToolkit<Variant>VerifyStorageCaps`, a separate task that re-reads the final merged
  manifest and fails `assemble`/`bundle` if either cap is missing or different. The Expo task still
  logs "Removed 'android:maxSdkVersion'"; the restore runs after it.
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
2. **AdMob** (only when ads are enabled). Create the AdMob account and the Android app, then one adaptive banner unit and one
   interstitial unit. Store the three IDs as EAS environment variables for the `production`
   environment (see [Build](#build)). The app ID looks like `ca-app-pub-<digits>~<digits>`, the
   unit IDs like `ca-app-pub-<digits>/<digits>`; anything else, or Google's test publisher
   `ca-app-pub-3940256099942544`, fails the build on purpose.
3. **UMP / GDPR message** (only when ads are enabled). In AdMob → Privacy & messaging, create and publish a GDPR (European
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
7. **Ads after a consent refusal (real IDs)** (only when ads are enabled). With the real IDs, a published GDPR message and an
   EEA test device (its hashed ID in `ADS_TEST_DEVICE_IDS` on a preview build), choose "Do not
   consent", then watch whether Home and Files fill an ad. If ads fill and you would prefer none
   after a refusal, ask for the IABTCF purpose-1 gate (no ad request unless
   `IABTCF_PurposeConsents` grants purpose 1).
8. **Crash-report opt-out (Firebase).** With the real Firebase project, turn "Send crash reports"
   off, force a test crash, and confirm nothing arrives in the Crashlytics console.

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
# Only when ads are enabled (ADS_ENABLED=true): the three AdMob IDs
eas env:create --environment production --name ADMOB_ANDROID_APP_ID --value 'ca-app-pub-…~…' --visibility sensitive
eas env:create --environment production --name ADMOB_BANNER_ID --value 'ca-app-pub-…/…' --visibility sensitive
eas env:create --environment production --name ADMOB_INTERSTITIAL_ID --value 'ca-app-pub-…/…' --visibility sensitive
# eas env:create --environment production --name ADS_ENABLED --value true --visibility plaintext
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
- Ads are off unless `ADS_ENABLED=true`; with them off, the AdMob ID check is skipped. With
  `ADS_ENABLED=true` and `APP_ENV=production`, `app.config.ts` throws "Production build needs real AdMob IDs" when
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
  off. Optional: the user can turn it off in Settings. Where the consent form applies (EEA/UK), it
  is on only when the user's consent choices allow storing information on the device (TCF purpose
  1) and measuring content performance (purpose 8); "Do not consent", refusing either purpose,
  withdrawing them later in Privacy options, or a consent state that cannot be read keeps it off.
  Outside those regions it follows the Settings switch alone.
- **Firebase Crashlytics (only when enabled).** Crash logs and diagnostics (stack traces, device
  model, OS version, a Crashlytics installation ID). No custom logs or keys. Optional: the user can
  turn it off in Settings.
- **ML Kit document scanner (Google Play services).** The scanning itself runs on the device. The
  ML Kit and Firebase components (`transport-*`, `firebase-components`) send Google anonymous API
  usage and performance counts (which feature ran, how long it took, errors), without image
  content. Declare it under diagnostics/app performance.
- **Encrypted in transit:** yes (all SDK traffic is HTTPS). **Deletion request:** no user account
  and no server-side user data held by the app itself.
- **Release permissions** (Task 11 release APK, `aapt2 dump xmltree`, default variant; a build
  with Firebase linked has the same list):
  - Ads SDK: `INTERNET`, `ACCESS_NETWORK_STATE`, `com.google.android.gms.permission.AD_ID`,
    `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_ADSERVICES_TOPICS`,
    `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`.
  - Storage: `MANAGE_EXTERNAL_STORAGE` (not in `production-saf`), `READ_EXTERNAL_STORAGE`
    (max SDK 32), `WRITE_EXTERNAL_STORAGE` (max SDK 29).
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

**Task 11 final numbers** (all ABIs, Firebase not linked, test ad IDs):

| Artifact | Size |
| --- | --- |
| `app-release.aab` | 94 438 809 B (90.1 MiB) |
| Universal `app-release.apk` (4 ABIs) | 137 357 075 B (131.0 MiB) |
| arm64-only release APK (`-PreactNativeArchitectures=arm64-v8a`) | 51 823 212 B (49.4 MiB) |
| **AAB download size, arm64-v8a** (`bundletool get-size total --dimensions=ABI`, bundletool 1.17.2) | **26 363 402 – 26 498 171 B (25.1–25.3 MiB)** |
| AAB download size, armeabi-v7a / x86 / x86_64 | 24.8–24.9 / 27.1–27.2 / 27.0–27.2 MB |
| M5 APK for comparison (arm64-only, before R8) | 58 450 484 B (55.7 MiB, "58.4 MB") |

The arm64 download size is under the §4 40 MB target. The universal APK is only for sideloading;
Play never delivers it.

**M7 Task 1: after PdfBox, before M7 tools** (`com.tom-roush:pdfbox-android:2.0.27.0` without
`bcpkix`/`bcutil`; arm64-only `bundleRelease`, R8 + resource shrinking, Firebase not linked, ads off):

| Measurement | M6 | After PdfBox | Change |
| --- | --- | --- | --- |
| AAB download size, arm64 phone (`get-size total`, API 34, 420 dpi, `en`) | 26 488 623 B | 32 286 546 B (30.8 MiB) | +5 797 923 B |
| AAB download size, arm64-v8a (`get-size total --dimensions=ABI`) | 26 363 402 – 26 498 171 B | 32 159 822 – 32 295 009 B | +5.8 MB |

Task 1 gate (stop at ≥ 34 MB): passed, with 1.7 MB left before the gate and 7.7 MB before the
§4 40 MB target. Where the growth comes from (stored sizes in `base-master.apk`):

- 4 138 070 B: BouncyCastle post-quantum parameter tables, Java resources that ship next to the
  dex (`org/bouncycastle/pqc/crypto/picnic/lowmc.properties` 1.57 MB, `pqc/crypto/sike/p751`,
  `p610`, `p503`, `p434.properties`). PdfBox never uses them (only bcprov's AES). R8 does not
  remove Java resources, so `plugins/withPackagingExcludes.js` now excludes
  `org/bouncycastle/pqc/**` from `:app` packaging (see the next table).
- 1 618 605 B: PdfBox-Android assets (112 files: CMaps, `LiberationSans-Regular.ttf`, glyph lists).
- Dex: 9 045 444 B compressed, the same as M6, because R8 strips PdfBox code that nothing calls
  yet. The M7 tools add their share of PdfBox dex later; Task 14 measures it.

After excluding `org/bouncycastle/pqc/**` (Task 1 fix round 1, same build settings):

| Measurement | After PdfBox | With the pqc exclude | Change |
| --- | --- | --- | --- |
| AAB download size, arm64 phone (`get-size total`, API 34, 420 dpi, `en`) | 32 286 546 B | **28 146 914 B (26.8 MiB)** | −4 139 632 B |
| AAB download size, arm64-v8a (`get-size total --dimensions=ABI`) | 32 159 822 – 32 295 009 B | 28 021 309 – 28 155 377 B | −4.1 MB |

That is +1 658 291 B over M6, leaving 5.9 MB before the Task 1 gate and 11.9 MB before 40 MB. The
AAB holds no `org/bouncycastle/pqc` entry; the two small `x509/CertPathReviewerMessages*.properties`
(92 KB raw) remain. The AES-256 round trip (`PdfBoxSupportTest`) still passes.

Largest entries of the universal APK (`unzip -lv`, by stored size): `lib/x86/libreactnative.so`
7.36 MB, `lib/x86_64/libreactnative.so` 7.10 MB, `lib/arm64-v8a/libreactnative.so` 6.99 MB,
`assets/index.android.bundle` 6.74 MB, `lib/x86_64/libpdfium.so` 4.97 MB,
`lib/armeabi-v7a/libreactnative.so` 4.86 MB, `lib/arm64-v8a/libpdfium.so` 4.77 MB,
`lib/x86/libpdfium.so` 4.53 MB, `classes2.dex` 3.41 MB compressed (8.06 MB),
`lib/armeabi-v7a/libpdfium.so` 3.19 MB. The three dex files hold 21.9 MB uncompressed, 9.0 MB
compressed.

Native libraries (29 per ABI, identical to the M5 set; the ads SDK adds none): `libNitroMmkv`,
`libNitroModules`, `libandroidx.graphics.path`, `libanimation-decoder-gif`, `libappmodules`,
`libavif_android`, `libc++_shared`, `libexpo-modules-core`, `libexpo-sqlite`, `libfbjni`,
`libgesturehandler`, `libgifimage`, `libhermestooling`, `libhermesvm`, `libimagepipeline`,
`libjsi`, `libmmkv`, `libnative-filters`, `libnative-imagetranscoder`, `libpdfium`,
`libpdfiumandroid`, `libreact_codegen_rnscreens`, `libreact_codegen_safeareacontext`,
`libreactnative`, `libreanimated`, `librnscreens`, `libstatic-webp`, `libworklets`,
`libzstd-kmp`. With `google-services.json` present, Firebase adds `libcrashlytics`,
`libcrashlytics-common`, `libcrashlytics-handler`, `libcrashlytics-trampoline` and
`libdatastore_shared_counter` (all pass the 16 KB checks).

## Release verification (Task 11)

Local release builds: `npx expo prebuild --platform android --clean`, then
`./gradlew :pdf-native:testDebugUnitTest bundleRelease` and `./gradlew assembleRelease` as two
runs (on an 8 GB machine, one Gradle run with both tasks runs out of heap; pass
`-Dorg.gradle.jvmargs=-Xmx3072m`). All BUILD SUCCESSFUL; pdf-native unit tests 191/0.
`APP_VARIANT=play-saf` `assembleRelease` also succeeded. Both `assemble` and `bundle` run
`pdfToolkitReleaseVerifyStorageCaps`. Check the shipped AAB's permissions with
`java -jar bundletool.jar dump manifest --bundle app-release.aab | grep uses-permission`.

| Check | Result |
| --- | --- |
| 16 KB: `zipalign -c -P 16 -v 4`, `llvm-objdump -p` | Pass. 29/29 arm64 `.so` OK, every `LOAD` `align 2**14`. Firebase build: 34/34 incl. `libcrashlytics*` |
| Manifest, default (APK; the AAB's `bundletool dump manifest` has the same `uses-permission` list, READ max 32 and WRITE max 29) | `INTERNET`, `MANAGE_EXTERNAL_STORAGE`, `READ_EXTERNAL_STORAGE` (max 32), `WRITE_EXTERNAL_STORAGE` (max 29), `WAKE_LOCK`, `ACCESS_NETWORK_STATE`, `AD_ID`, `ACCESS_ADSERVICES_AD_ID/ATTRIBUTION/TOPICS`, `FOREGROUND_SERVICE`, `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, `BIND_GET_INSTALL_REFERRER_SERVICE`. No `CAMERA`, `READ_MEDIA_*`, `SYSTEM_ALERT_WINDOW`, `ACCESS_WIFI_STATE`, `DOWNLOAD_WITHOUT_NOTIFICATION`, `VIBRATE`. `allowBackup=false`, `fullBackupContent=false`, `dataExtractionRules` set. AdMob app ID = Google test ID. The PDF VIEW/SEND filters have no scheme (the `exp+pdf-toolkit` scheme is only on the `pdftoolkit://` deep-link filter) |
| Manifest, `play-saf` | Same list without `MANAGE_EXTERNAL_STORAGE`; READ max 32, WRITE max 29; same backup, AdMob and filter results; 29/29 arm64 `.so` pass the 16 KB checks. `extra.appVariant` = `play-saf`, `allFilesAccessEnabled` = false |
| Crashlytics keep rule (Firebase build with a placeholder `google-services.json`, arm64, R8) | Pass. `com.google.firebase.crashlytics.FirebaseCrashlytics` keeps its name, `getInstance()` and `setCrashlyticsCollectionEnabled(java.lang.Boolean)` (apkanalyzer). On Pixel_Fold_API_34 the app started with Crashlytics initialised; turning "Send crash reports" off caused no exception and the process kept running. Whether the reflective call returned true cannot be seen in a minified build (Firebase's own confirmation is a stripped `Log.d`); `CrashReportsSwitchTest` covers the return value. Upload behaviour needs the real Firebase project (user check: opt out, force a test crash, confirm nothing arrives) |
| Ads: UMP (EEA test mode) | The consent form shows after onboarding on both emulators. "Consent" → test banner on Home and Files. No ad in the reader, Tools, the Merge flow, `/scan` or Settings. Settings shows "Ad privacy choices" and reopens the form |
| Ads: "Do not consent" / "Manage options → Confirm choices" | A **test** banner still shows: after any choice UMP reports `canRequestAds() = true`, and Google's test ad unit fills regardless of the TCF choices. **Decision: after a refusal we still request ads (Google's canRequestAds contract); Google serves limited ads or no fill depending on the TCF choices. Not yet verified with real IDs.** See user action 7 |
| Interstitial cap | Merge → Done → test interstitial (11:49:10). Another merge → Done at 11:49:59 → none. Force-stop, relaunch, merge → Done at 11:50:46 → none. Merge → Done at 11:52:49 (≥ 3 min) → shown. Result → Open → reader, no ad |
| Offline (airplane mode, cold start) | No banner and no blank gap, merge works, Done returns to Home at once, no crash |
| Settings | Dark theme applies at once. Images to PDF with the same 3 photos: "Smaller files" 851 654 B vs "Standard" 4 350 231 B. Clear cache → "Freed 226.1 KB", Files thumbnails regenerate. Analytics/crash switches stay off after a force-stop. Open-source licences list. "Version 1.0.0 (1)" |
| Pickers in the minified build | Document picker (Merge → Browse files…) returns the file. Folder picker: SAF onboarding → Documents → Use this folder → Allow returns to the app, and Settings → Add folder → Pictures adds a second scanned folder (Fold). Save as… on the Fold wrote a byte-identical 6 514 B copy to the chosen folder (`ls -l` and the MediaStore row checked). Share opens the chooser. No crash |
| Scanner after recreation (Task 8) | Font scale 1.0 → 1.15 in the foreground → Scan opens the ML Kit scanner. Recreated again while the scanner was open → after leaving it, Scan opens again |
| Fold layout | Unfolded (letterboxed app): banner `[446,1276][1763,1627]` fits the app width and ends above the tab bar (`[.., 1628]`). Folded: banner refits `[0,1564][1080,1900]`, tab bar from 1901 |
| Crash check | No `FATAL EXCEPTION`, `ClassNotFoundException` or `NoSuchMethodError` from the app in the Pixel_10a and Fold logcats |

The emulator counts as a UMP test device: the EEA form showed without `ADS_TEST_DEVICE_IDS`, and
the minified build logged no `addTestDeviceHashedId` hint. On a physical test phone, read the
hint from a debug build and pass it as `ADS_TEST_DEVICE_IDS`.

## Known limitations

These need a physical phone and are not covered by the emulator runs:

- **Ads after a consent refusal with real IDs** (user action 7): the app still requests ads after
  "Do not consent"; whether Google fills them was only seen with test IDs, which always fill.

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
