# Milestone 6 — Ads, Consent, Analytics, Settings and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MVP becomes releasable. AdMob shows a banner on Home and Files and an interstitial after a finished tool, at most once every 3 minutes, and never in the reader. No ad is requested before Google UMP consent. Crash reporting and anonymous tool-usage events sit behind one telemetry interface; they are live only when the user's `google-services.json` exists and are otherwise a no-op. Settings covers A-01: theme, language, output folder, image/scan quality, clear cache, privacy choices, and about with licences. The M5 carry-overs are closed: backup rules, manifest permissions, release log privacy, APK size, slow 100-photo jobs, and the scanner failing after activity recreation. The milestone ends with a signed-ready AAB profile, `docs/RELEASE.md` and a release smoke run on two emulators.

**Architecture:** Ads live in `src/services/ads/*`: config, consent, a zustand ads store, an interstitial controller and a pure cap rule. One component, `src/components/AdBanner.tsx`, is the only other place allowed to import `react-native-google-mobile-ads`. Telemetry is `src/services/telemetry/telemetry.ts`, an interface with a no-op default. `firebaseTelemetry.ts` is `require`d lazily only when `Constants.expoConfig.extra.firebaseEnabled` is true. One CommonJS helper, `firebaseConfig.js`, decides that flag from the presence of `google-services.json` for both `app.config.ts` (plugins, `googleServicesFile`) and a new root `react-native.config.js`, which removes the `@react-native-firebase/*` native code from autolinking when the file is missing. Lifecycle components in the root layout start consent and ads after onboarding and apply the telemetry opt-outs. The job store reports each finished job to telemetry. The result screen's Done button hands off to the interstitial controller after navigating away.

**Tech Stack:** Expo SDK 57 (`expo@~57.0.30`, RN 0.86.3, New Architecture), Expo Router, Zustand 5, MMKV, **new:** `react-native-google-mobile-ads@17.4.0` (requires RN ≥ 0.86 + New Architecture; Android GMA SDK 25.5.0, UMP 4.0.0; Expo config plugin keys `androidAppId`, `delayAppMeasurementInit`, `optimizeInitialization`, `optimizeAdLoading`; `AdsConsent.gatherConsent/getConsentInfo/showPrivacyOptionsForm`; Android test IDs app `ca-app-pub-3940256099942544~3347511713`, banner `ca-app-pub-3940256099942544/9214589741` (adaptive), interstitial `ca-app-pub-3940256099942544/1033173712`); `@react-native-firebase/app`, `/crashlytics`, `/analytics` all `27.0.0` (each ships `app.plugin.js`; crashlytics links `firebase-crashlytics-ndk`, which contains `.so` files); `expo-application@~57.0.3`; `expo-build-properties` `enableMinifyInReleaseBuilds` / `enableShrinkResourcesInReleaseBuilds` / `extraProguardRules`. All checked in node_modules and npm tarballs on 2026-10-24.

**Spec:** `docs/REQUIREMENTS.md` §1 (monetisation: banner on lists, interstitial only after a tool finishes, no ads in the reader), §3.4 A-01–A-04, §4 (privacy, app size, accessibility, localisation), §5 (INTERNET / ACCESS_NETWORK_STATE / AD_ID for ads only), §6 (ads, Crashlytics + Analytics, EAS production AAB), §8 (Settings contents, `AdBanner`, result "interstitial ad slot after leaving"), §9 item 6, §10.2–10.4. Program ledger: `.superpowers/sdd/program.md`. Every M1–M5 Ruling applies, including the three Program rulings on Firebase, AdMob test IDs and user-only Play Console work.

## Global Constraints

- Android only; no iOS code or config (the ads plugin gets no `iosAppId`). minSdk 24, targetSdk 36, compileSdk 36. Dev build, New Architecture. Routes only in root `app/`.
- TypeScript strict. `npm run typecheck`, `npm run lint`, `npm test` and `npm run format:check` pass at the end of every task. Native changes also pass `cd android && ./gradlew :pdf-native:testDebugUnitTest :app:compileDebugKotlin` (after `npx expo prebuild --platform android --clean`). Java and SDK: `export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.20.1+1/Contents/Home`, `export ANDROID_HOME=~/Library/Android/sdk`.
- All user-facing strings come from `src/i18n/en.json`; exact copy is given per task. `mr.json` and `hi.json` stay `{}`. Touch targets are ≥ 48 dp, every pressable or switch has an `accessibilityLabel`, and there is no `allowFontScaling={false}`.
- Install packages with `npx expo install <pkg>@<exact version>` (versions above). No other new dependencies.
- **Import boundaries** (ESLint, extending the existing `eslint.config.js` pattern, and pinned in `eslintImports.test.ts`). `react-native-google-mobile-ads` is allowed only in `src/services/ads/**`, `src/components/AdBanner.tsx`, tests and `jest.setup.js`. `@react-native-firebase/*` is allowed only in `src/services/telemetry/firebaseTelemetry.ts`, tests and `jest.setup.js`. Screens reach ads and telemetry only through those services and components. The existing pdf-lib, expo-file-system and sortables rules stay as they are.
- **Ads policy** (§1, §8, §10.3). No ad request (banner mount, interstitial `load`, `mobileAds().initialize()`) happens before consent gathering ends with `canRequestAds === true`. There are no ads in `app/reader/**`, `app/onboarding.tsx`, tool flows, `/scan`, `/result` or Settings. The interstitial is shown only after the user taps **Done** on a *successful* result, after the navigation away, and only when one is already loaded. It never waits, retries or delays the user. The cap is `INTERSTITIAL_CAP_MS = 180_000`, persisted across restarts. Banners are adaptive anchored banners at the bottom of Home and Files only.
- **AdMob IDs.** Builds use Google's test IDs unless `APP_ENV=production`. A production config requires `ADMOB_ANDROID_APP_ID`, `ADMOB_BANNER_ID` and `ADMOB_INTERSTITIAL_ID`, and `app.config.ts` throws a clear error when any is missing or is a Google test ID. Debug consent settings (`ADS_DEBUG_GEOGRAPHY=EEA`, `ADS_TEST_DEVICE_IDS`) are honoured only when `APP_ENV !== 'production'`.
- **Offline.** Ads and telemetry never block startup, navigation or a tool. Every ads or telemetry call is wrapped so a rejection or throw is swallowed and leaves ads off for that moment. With no network the app behaves exactly as M5, with no banner gap and no interstitial.
- **Telemetry privacy** (§3.4 A-04, §4). Events carry only enums and numbers from a closed schema. They never carry file names, paths, URIs, user-typed text or error messages. Crashlytics gets no custom logs or keys. Analytics advertising-ID and SSAID collection is off, and automatic screen reporting is off. The user can opt out of analytics and of crash reports separately; both default to on.
- Permissions: the M5 blocked list stays, and `android.permission.VIBRATE` is added to it. The ads SDK may add `INTERNET`, `ACCESS_NETWORK_STATE`, `com.google.android.gms.permission.AD_ID` and `ACCESS_ADSERVICES_*`. Each one in the release manifest is recorded in `docs/RELEASE.md` (data safety). No `CAMERA`, `READ_MEDIA_*`, `SYSTEM_ALERT_WINDOW`, `ACCESS_WIFI_STATE`, `DOWNLOAD_WITHOUT_NOTIFICATION` or `VIBRATE`.
- Logs: the only app log lines are the M5 `[tool]` line and the new `[tool-phases]` line (Task 9), which hold counts and milliseconds only. Native `Log.d`/`Log.v` are stripped from release builds by R8 (Task 10).
- Commit after each task. Messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Decisions this plan makes (the spec leaves them open):**
- **Where the interstitial sits:** on **Done** of a successful result (spec §8 "after leaving"). Open, Share, Save as, hardware Back, a failed or cancelled job and an interrupted job never trigger it, so a user who opens the output goes straight into the reader with no ad. It is preloaded when a job starts, and only when consent allows ads. If it is not loaded at Done, nothing is shown. Cap rule: `canShowInterstitial(last, now)` is true when `last === null` or `now − last ≥ 180 000`. When `now < last` (the clock moved back), the stored value is reset to `now` and the result is false.
- **Consent timing:** UMP `gatherConsent` runs once per cold start after onboarding is done, from `AdsLifecycle`, not over onboarding. `mobileAds().setRequestConfiguration({ maxAdContentRating: PG, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false })`, then `initialize()`, run only when `canRequestAds`. When `gatherConsent` rejects (offline), `getConsentInfo()` (UMP's cached state) decides. When that rejects too, ads stay off. Settings shows "Ad privacy choices" only when `privacyOptionsRequirementStatus === REQUIRED`.
- **Firebase gating:** `firebaseEnabled` = the file at `process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'` exists. When it is false, `react-native.config.js` sets `platforms: { android: null }` for the three `@react-native-firebase/*` packages, so no native code, no `.so` and no Google services plugin are built. The JS adapter is never required. If Expo's autolinking ignores the override (Task 2 verifies with `npx expo-modules-autolinking react-native-config --platform android --json`), the fallback is to **not install** the Firebase packages and to keep `firebaseTelemetry.ts` plus documented install steps in `docs/RELEASE.md`. `google-services.json` is git-ignored and supplied through an EAS file environment variable `GOOGLE_SERVICES_JSON`. `firebase.json`: `analytics_auto_collection_enabled true`, `google_analytics_adid_collection_enabled false`, `google_analytics_ssaid_collection_enabled false`, `google_analytics_automatic_screen_reporting_enabled false`, `analytics_default_allow_ad_storage false`, `analytics_default_allow_ad_user_data false`, `analytics_default_allow_ad_personalization_signals false`, `crashlytics_auto_collection_enabled true`, `crashlytics_ndk_enabled true`, `crashlytics_is_error_generation_on_js_crash_enabled true`. The user toggles are applied at runtime.
- **Event schema:** one event, `tool_finished { tool: RunnableToolId, result: 'success' | 'failed' | 'cancelled', failure: ToolFailure | 'none', duration_ms: number (rounded to 100), inputs: number, pages_bucket: '0' | '1-10' | '11-50' | '51-200' | '200+' }`. Firebase's automatic events (first_open, session_start) remain and are listed for data safety.
- **Language:** the options are "Phone language" (`null`) and "English", plus a note that Marathi and Hindi come later. `mr`/`hi` are not selectable while their files are empty. A choice persists and calls `i18n.changeLanguage(resolveLanguage(choice, deviceCodes))`.
- **Default save folder:** shown as information only (`Documents/PDFToolkit`). Choosing another folder is out of scope for the MVP.
- **Image quality (A-01 "scan quality"):** `ImageQuality = 'compact' | 'standard' | 'high'`, default `standard`, applied to Images to PDF and Scan. Presets: compact 1600 px / q75, standard 2400 / 85 (M5 values), high 3200 / 90. The budget fallback is compact → 1200 / 65; standard and high → 1600 / 75. The value is read when the job starts, stored in the request and job options, and an old M5 row without it means `standard`.
- **Clear cache:** deletes `cacheDir/thumbs`, `cacheDir/reader` and `cacheDir/share` entries older than 10 minutes. It never touches `cacheDir/tools` (jobs and image sessions) or the scanner cache. It is disabled while a tool job runs. Afterwards every `thumb_path` is reset to null and thumbnails are regenerated lazily.
- **Backup:** `android.allowBackup: false` plus a `dataExtractionRules` XML that excludes every domain from both cloud backup and device transfer (Android 12+ ignores `allowBackup=false` for device-to-device transfer). The DB holds URIs and grants that are invalid on a new install, so restoring it is wrong.
- **Remove ads** purchase: not in M6 (spec says "later"). No row in Settings.
- **Licences:** `scripts/make-licenses.mjs` writes `src/config/licenses.json` from `npm ls --omit=dev --all --json`, and a hand-kept `src/config/nativeNotices.ts` lists the Android libraries. The `/licenses` route lists both.

## Review Focus

1. **No network or a failing consent fetch** (airplane mode at cold start, UMP fetch timeout, ad load failure). The app opens, Home/Files show no banner and leave no empty gap, tools run, Done leaves at once, and nothing crashes. Tests: Task 3 `adsConsent.test` (gather rejects → cached info decides; both reject → ads off), Task 4 `AdBanner.test` (failed load → renders nothing), Task 4 `interstitial.test` (not loaded → `showAfterDone` returns false and does not wait), Task 11 airplane-mode smoke.
2. **Interstitial cap edges** (two jobs within 3 minutes, a cold restart within 3 minutes, the clock moved back, Done on a failed job, Open → reader). At most one interstitial per 180 s across restarts, and none outside a successful Done. Tests: Task 4 `interstitialCap.test`, `interstitial.test` (persisted timestamp survives a new controller), `result.test.tsx` (Done success → controller called; Close/failed/Open → not).
3. **Consent declined or privacy options changed** (EEA user rejects, later withdraws in Settings). No banner mounts, `InterstitialAd.createForAdRequest` is never called, and `initialize` is not called. After the privacy options form, the state is re-read and ads disappear at once if `canRequestAds` turns false. Tests: Task 3 (store with `canRequestAds false`), Task 4 (no `BannerAd` rendered, no create call), Task 6 (privacy row → `showPrivacyOptionsForm` → refresh).
4. **Telemetry leaking user data** (a failed job whose input is named `Salary-2026.pdf`, a typed scan name, analytics opted out, Firebase not configured). Events hold only schema keys with enum or number values; opted out → no `logEvent`; not configured → the no-op adapter and no `@react-native-firebase` require. Tests: Task 2 `toolEvent.test`, `telemetry.test`, `toolJobStore.test`.
5. **Clear cache racing work** (a job running, the cached thumbnail grid re-rendering, a reader copy, a share in progress). A running job disables the button; image sessions and job workspaces survive; the Files list re-renders placeholders and regenerates thumbnails; a recent share copy (< 10 min) is kept. Tests: Task 5 `CacheCleanerTest` (JVM), `clearCache.test`, `filesStore.test` (`resetThumbnails`).

---

### Task 1: Image quality setting wired into images and scan jobs

**Files:**
- Modify: `src/services/tools/limits.ts`, `src/stores/settingsStore.ts`, `src/services/tools/runTool.ts`, `src/stores/toolJobStore.ts`, `src/components/tools/ImagesToPdfFlow.tsx`, `app/scan.tsx`, `src/services/prefs/KeyValueStore.ts`, `memoryStore.ts`, `mmkvStore.ts` (add `getNumber`)
- Test: `src/services/tools/__tests__/{limits,runTool}.test.ts`, `src/stores/__tests__/{settingsStore,toolJobStore}.test.ts`, `src/__tests__/screens/{imagesToPdf,scan}.test.tsx`

**Interfaces:**
- Consumes: M5 `ImagesRequest`, `runImages`, `prepare`, `optionsOf`, `imagesFrom`.
- Produces:
  - `limits.ts`: `type ImageQuality = 'compact' | 'standard' | 'high'`; `IMAGE_QUALITIES: readonly ImageQuality[]`; `IMAGE_QUALITY_PRESETS: Record<ImageQuality, { longSidePx: number; jpegQuality: number; smallerLongSidePx: number; smallerJpegQuality: number }>` = compact `{1600, 75, 1200, 65}`, standard `{2400, 85, 1600, 75}`, high `{3200, 90, 1600, 75}`. The M5 constants stay as aliases of `standard`.
  - `KeyValueStore.getNumber(key: string): number | undefined` (memory and MMKV).
  - `settingsStore`: `imageQuality: ImageQuality` (MMKV key `imageQuality`, an unknown value → `'standard'`), `setImageQuality(q)`.
  - `ImagesRequest.quality: ImageQuality`. `optionsOf` stores `quality`. `imagesFrom` reads it, and a missing or invalid value → `'standard'`. `runImages` uses the preset's two pairs where M5 used the constants.
  - Both flows pass `quality: useSettings.getState().imageQuality` read at Run time.

- [ ] **Step 1: Write failing tests.**
  - `limits`: the presets equal the values above; `IMAGE_MAX_LONG_SIDE_PX === IMAGE_QUALITY_PRESETS.standard.longSidePx`.
  - `settingsStore` (memory KV): default `'standard'`; `setImageQuality('high')` persists and a new store reads `'high'`; stored `'ultra'` → `'standard'`; `getNumber` round-trips `180000`.
  - `runTool`: `quality: 'high'` → first `prepareImagePage` call has `(…, 3200, 90, …)`; `'compact'` with the budget forcing a re-prepare → second call `(…, 1200, 65, …)`.
  - `toolJobStore`: `optionsOf(images with quality 'compact').quality === 'compact'`; `requestFromJob` on an M5-shaped row without `quality` → `quality: 'standard'`; `quality: 'x'` → `'standard'`.
  - `imagesToPdf.test` / `scan.test`: the expected `start(...)` arguments gain `quality: 'standard'`; with `useSettings.setState({ imageQuality: 'high' })` → `quality: 'high'`.
- [ ] **Step 2:** `npm test -- limits runTool settingsStore toolJobStore imagesToPdf.test scan.test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat(tools): image quality setting for images to PDF and scans`.

### Task 2: Telemetry interface, conditional Firebase wiring, tool events and opt-outs

**Files:**
- Create: `src/services/telemetry/telemetry.ts`, `src/services/telemetry/toolEvent.ts`, `src/services/telemetry/firebaseTelemetry.ts`, `src/components/TelemetryLifecycle.tsx`, `firebaseConfig.js` (root, CommonJS), `react-native.config.js` (root), `firebase.json`
- Modify: `package.json` (via `npx expo install @react-native-firebase/app@27.0.0 @react-native-firebase/crashlytics@27.0.0 @react-native-firebase/analytics@27.0.0`), `app.config.ts`, `.gitignore` (`google-services.json`), `eslint.config.js`, `src/services/pdf/__tests__/eslintImports.test.ts`, `src/stores/settingsStore.ts`, `src/stores/toolJobStore.ts`, `app/_layout.tsx`, `jest.setup.js`
- Test: `src/services/telemetry/__tests__/{telemetry,toolEvent}.test.ts`, `src/config/__tests__/{appConfig,firebaseConfig}.test.ts`, `src/stores/__tests__/{settingsStore,toolJobStore}.test.ts`

**Interfaces:**
- Consumes: `ToolOutcome`, `ToolFailure`, `RunnableToolId`, `ToolRequest`.
- Produces:
  - `firebaseConfig.js`: `googleServicesPath(env = process.env): string` (`env.GOOGLE_SERVICES_JSON ?? path.join(__dirname, 'google-services.json')`); `isFirebaseEnabled(env = process.env, exists = fs.existsSync): boolean`; `FIREBASE_PACKAGES = ['@react-native-firebase/app', '@react-native-firebase/crashlytics', '@react-native-firebase/analytics']`.
  - `react-native.config.js`: `{ dependencies: enabled ? {} : Object.fromEntries(FIREBASE_PACKAGES.map(p => [p, { platforms: { android: null, ios: null } }])) }`.
  - `app.config.ts`: when enabled, `android.googleServicesFile = googleServicesPath()` and plugins `'@react-native-firebase/app'` and `'@react-native-firebase/crashlytics'`; always `extra.firebaseEnabled: boolean`.
  - `toolEvent.ts`: `type ToolEvent = { name: 'tool_finished'; params: { tool: RunnableToolId; result: 'success' | 'failed' | 'cancelled'; failure: ToolFailure | 'none'; duration_ms: number; inputs: number; pages_bucket: '0' | '1-10' | '11-50' | '51-200' | '200+' } }`; `toolFinishedEvent(request: ToolRequest, outcome: ToolOutcome, durationMs: number, pages: number): ToolEvent`. `inputs` = `inputIds.length`, or `images.length` for image jobs. Cancelled → result `'cancelled'`, failure `'none'`. `duration_ms` = `Math.max(0, Math.round(ms / 100) * 100)`.
  - `telemetry.ts`: `type Telemetry = { setCollection(prefs: { analytics: boolean; crashes: boolean }): Promise<void>; log(event: ToolEvent): void }`; `noopTelemetry`; `createTelemetry(firebaseEnabled: boolean, load = () => require('./firebaseTelemetry').firebaseTelemetry): Telemetry` returns no-op when disabled or when `load` throws. Every adapter call is wrapped in try/catch and promise `.catch`. `log` is a no-op while analytics is off (the last `setCollection` wins; the default is on). `export const telemetry = createTelemetry(Constants.expoConfig?.extra?.firebaseEnabled === true)`.
  - `firebaseTelemetry.ts`: `firebaseTelemetry: Telemetry` using the modular API (`getAnalytics`, `logEvent`, `setAnalyticsCollectionEnabled`, `getCrashlytics`, `setCrashlyticsCollectionEnabled`). Check the exact names in `node_modules/@react-native-firebase/*/lib/modular` and use the namespaced API if they differ.
  - `settingsStore`: `analyticsEnabled: boolean` (default true), `crashReportsEnabled: boolean` (default true), `setAnalyticsEnabled`, `setCrashReportsEnabled`.
  - `TelemetryLifecycle` (root layout): calls `telemetry.setCollection({ analytics, crashes })` on mount and whenever either setting changes.
  - `ToolJobStoreDeps.onJobFinished?: (request: ToolRequest, outcome: ToolOutcome, durationMs: number) => void`, called from `finish` inside try/catch. The app store wires it to `telemetry.log(toolFinishedEvent(request, outcome, ms, pagesOf(outcome)))`, where `pagesOf` sums `outputs[].pageCount ?? 0`. The runner's `pages` is not exposed.
  - ESLint: generalise the `no-restricted-syntax` restriction into a list `[SORTABLES, ADS, FIREBASE]` with per-zone exclusions: `restrictedSyntax(except: string[])` builds the selectors for every entry not in `except`. FIREBASE matches `source.value=/^@react-native-firebase\//`. Zones: all files → `[]`; `src/components/**` → `[SORTABLES]`; `src/components/AdBanner.tsx` → `[SORTABLES, ADS]`; `src/services/ads/**` → `[ADS]`; `src/services/telemetry/firebaseTelemetry.ts` → `[FIREBASE]`; tests, `src/test-utils/**`, `jest.setup.js` → off. ADS is defined here and used in Task 3.
  - `jest.setup.js`: virtual-safe mocks for the three Firebase modules (jest.fn functions returning resolved promises).

- [ ] **Step 1: Write failing tests.**
  - `firebaseConfig`: `isFirebaseEnabled({}, () => false) === false`; `({ GOOGLE_SERVICES_JSON: '/x/g.json' }, p => p === '/x/g.json') === true`; `react-native.config.js` loaded with the file missing (mock `fs.existsSync`) → `dependencies['@react-native-firebase/crashlytics'].platforms.android === null`.
  - `appConfig`: with the file missing → no `@react-native-firebase/*` plugin, no `googleServicesFile`, `extra.firebaseEnabled === false`; present → both plugins and the path.
  - `toolEvent`: a failed merge (`notFound`, `inputIndex 0`), inputs named `Salary-2026.pdf` → `params` deep-equals `{ tool: 'merge', result: 'failed', failure: 'notFound', duration_ms: 1300, inputs: 2, pages_bucket: '0' }` for 1 349 ms. `JSON.stringify(event)` contains no `'.pdf'`, `'/'` or `'Salary'`. A scan with `name: 'My secret'` → no `'secret'` in JSON. Cancelled → `failure: 'none'`. Bucket boundaries: 0, 1, 10, 11, 50, 51, 200, 201.
  - `telemetry`: `createTelemetry(false, load)` never calls `load`; `load` throwing → no-op without throw; adapter `log` throwing → swallowed; after `setCollection({ analytics: false, crashes: true })`, `log` does not reach the adapter.
  - `toolJobStore`: a finished job calls `onJobFinished` once with its request and outcome; `onJobFinished` throwing does not break `last`.
  - `eslintImports.test`: `import 'react-native-google-mobile-ads'` errors in `app/index.tsx` and `src/components/Button.tsx` and is allowed in `src/services/ads/x.ts` and `src/components/AdBanner.tsx`; `require('@react-native-firebase/app')` errors in `src/services/telemetry/telemetry.ts` and is allowed in `firebaseTelemetry.ts`; the sortables cases still pass.
- [ ] **Step 2:** `npm test -- firebaseConfig appConfig toolEvent telemetry toolJobStore settingsStore eslintImports` → FAIL.
- [ ] **Step 3:** Install the packages and implement.
- [ ] **Step 4: Autolinking check.** `npx expo-modules-autolinking react-native-config --platform android --json | grep -c react-native-firebase` → `0` without `google-services.json`. Then `npx expo prebuild --platform android --clean && cd android && ./gradlew :app:compileDebugKotlin` → BUILD SUCCESSFUL, and `grep -c google-services android/app/build.gradle` → 0. If the count is not 0, apply the fallback decision (uninstall the packages, keep the adapter file excluded from the bundle by the flag, and document it), and record it in the report.
- [ ] **Step 5:** Tests, typecheck, lint, format:check → pass.
- [ ] **Step 6:** Commit `feat(telemetry): crash and usage telemetry behind an interface, Firebase only with google-services.json`.

### Task 3: AdMob config, UMP consent and ads lifecycle

**Files:**
- Create: `src/services/ads/adsConfig.ts`, `src/services/ads/adsConsent.ts`, `src/services/ads/adsStore.ts`, `src/components/AdsLifecycle.tsx`, `src/config/adsIds.js` (CommonJS, shared with app.config)
- Modify: `package.json` (`npx expo install react-native-google-mobile-ads@17.4.0`), `app.config.ts`, `app.json` (`blockedPermissions` += `android.permission.VIBRATE`), `app/_layout.tsx`, `jest.setup.js`
- Test: `src/services/ads/__tests__/{adsConfig,adsConsent,adsStore}.test.ts`, `src/config/__tests__/appConfig.test.ts`

**Interfaces:**
- Produces:
  - `src/config/adsIds.js`: `TEST_IDS = { appId: 'ca-app-pub-3940256099942544~3347511713', banner: 'ca-app-pub-3940256099942544/9214589741', interstitial: 'ca-app-pub-3940256099942544/1033173712' }`; `resolveAdsConfig(env): { appId; banner; interstitial; debugGeography: 'EEA' | 'disabled'; testDeviceIds: string[] }`. `APP_ENV !== 'production'` → `TEST_IDS`, `debugGeography` from `ADS_DEBUG_GEOGRAPHY === 'EEA'`, `testDeviceIds` from comma-separated `ADS_TEST_DEVICE_IDS` (trimmed, blanks dropped). Production → the `ADMOB_*` env values; a value that is missing or starts with `ca-app-pub-3940256099942544` throws `Error('Production build needs real AdMob IDs: set ADMOB_ANDROID_APP_ID, ADMOB_BANNER_ID, ADMOB_INTERSTITIAL_ID')`; debug geography is forced to `'disabled'` and `testDeviceIds` to `[]`.
  - `app.config.ts`: plugin `['react-native-google-mobile-ads', { androidAppId, delayAppMeasurementInit: true, optimizeInitialization: true, optimizeAdLoading: true }]`; `extra.ads = { banner, interstitial, debugGeography, testDeviceIds }`.
  - `adsConfig.ts`: `getAdsConfig(): { banner: string; interstitial: string; debugGeography: 'EEA' | 'disabled'; testDeviceIds: string[] }` from `Constants.expoConfig.extra.ads`, falling back to test IDs and debug off when it is absent.
  - `adsConsent.ts`: `type ConsentState = { canRequestAds: boolean; privacyOptionsRequired: boolean }`; `type ConsentApi = Pick<typeof AdsConsent, 'gatherConsent' | 'getConsentInfo' | 'showPrivacyOptionsForm'>`; `gatherAdsConsent(api: ConsentApi, config): Promise<ConsentState>`. It passes `{ debugGeography: AdsConsentDebugGeography.EEA | DISABLED, testDeviceIdentifiers }`. On rejection it uses `getConsentInfo()`, and when that also rejects → `{ false, false }`. `privacyOptionsRequired` = `privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED`. `openPrivacyOptions(api): Promise<ConsentState>` calls `showPrivacyOptionsForm()` and then re-reads `getConsentInfo()`; it rejects only when the form itself fails.
  - `adsStore.ts` (zustand, injectable deps `{ consent: ConsentApi; mobileAds: () => { setRequestConfiguration; initialize }; config }`): state `{ status: 'idle' | 'gathering' | 'ready' | 'off'; canRequestAds: boolean; privacyOptionsRequired: boolean }`; `start(): Promise<void>` runs once per process (re-entry → the same promise): gather → when `canRequestAds`, `setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false })` then `initialize()` → `ready`; else `off`. Any throw → `off`. `openPrivacyOptions(): Promise<boolean>` updates the state; false on failure. `useAds` is the app instance.
  - `AdsLifecycle` (root layout, inside `DbGate`): when `useSettings.onboardingDone` is true → `useAds.getState().start()` once.
  - `jest.setup.js`: mock `react-native-google-mobile-ads` (`AdsConsent` jest.fns, enums, `MaxAdContentRating`, `TestIds`, `BannerAd` as a host stub recording props, `BannerAdSize.ANCHORED_ADAPTIVE_BANNER`, `InterstitialAd.createForAdRequest` returning a fake with `load`, `show`, `addAdEventListener`, `loaded`, `AdEventType`, and a default `mobileAds()` returning jest.fns).

- [ ] **Step 1: Write failing tests.**
  - `resolveAdsConfig`: `{}` → test IDs, debug `'disabled'`; `{ ADS_DEBUG_GEOGRAPHY: 'EEA', ADS_TEST_DEVICE_IDS: ' A1, ,B2' }` → `'EEA'`, `['A1','B2']`; production with all three real IDs → those IDs and debug `'disabled'` even with `ADS_DEBUG_GEOGRAPHY=EEA`; production missing the interstitial ID → throws the exact message; production with a test app ID → throws.
  - `appConfig`: the plugin tuple contains the test `androidAppId` and `delayAppMeasurementInit: true`; `blockedPermissions` contains `VIBRATE`.
  - `adsConsent`: gather resolves `{ canRequestAds: true, privacyOptionsRequirementStatus: REQUIRED }` → `{ true, true }`; gather rejects and cached info is `{ canRequestAds: true }` → true (Review Focus 1); both reject → `{ false, false }`; debug `'EEA'` → `gatherConsent` called with `debugGeography: EEA` and the test ids.
  - `adsStore`: `canRequestAds false` → `status 'off'` and `initialize` not called (Review Focus 3); true → `setRequestConfiguration` before `initialize`, `status 'ready'`; `start()` twice → gather once; `initialize` throws → `'off'`, no unhandled rejection; `openPrivacyOptions` turning consent off → `canRequestAds false`, `status 'off'`.
- [ ] **Step 2:** `npm test -- adsConfig adsConsent adsStore appConfig` → FAIL.
- [ ] **Step 3:** Install and implement.
- [ ] **Step 4:** `npx expo prebuild --platform android --clean && cd android && ./gradlew :app:compileDebugKotlin :app:processDebugMainManifest` → BUILD SUCCESSFUL; the merged manifest has `com.google.android.gms.ads.APPLICATION_ID` = the test app ID and `VIBRATE` removed. Tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat(ads): AdMob with Google UMP consent before any ad request (test IDs outside production)`.

### Task 4: Banner on Home and Files, interstitial after Done with a 3-minute cap

**Files:**
- Create: `src/components/AdBanner.tsx`, `src/services/ads/interstitialCap.ts`, `src/services/ads/interstitial.ts`
- Modify: `app/(tabs)/home.tsx`, `app/(tabs)/files.tsx`, `app/result.tsx`, `src/components/AdsLifecycle.tsx` (preload on job start), `src/i18n/en.json`
- Test: `src/services/ads/__tests__/{interstitialCap,interstitial}.test.ts`, `src/components/__tests__/AdBanner.test.tsx`, `src/__tests__/screens/{home,files,result}.test.tsx`, `src/__tests__/adPlacement.test.ts`

**Interfaces:**
- Consumes: `useAds` (Task 3), `getAdsConfig`, `KeyValueStore.getNumber` (Task 1), `useToolJobs`.
- Produces:
  - `interstitialCap.ts`: `INTERSTITIAL_CAP_MS = 180_000`; `canShowInterstitial(lastShownAt: number | null, now: number, capMs = INTERSTITIAL_CAP_MS): boolean` (false when `now < lastShownAt`).
  - `interstitial.ts`: `createInterstitialController(deps: { create: (unitId: string) => InterstitialLike; kv: KeyValueStore; now: () => number; canRequestAds: () => boolean; unitId: string })` → `{ preload(): void; showAfterDone(): boolean }`. `preload` does nothing unless `canRequestAds()` holds and no ad is loaded or loading; it creates and loads, with `ERROR` → drop the ad. `showAfterDone`: when not loaded, or the cap forbids → false. A `now < last` reading stores `ads.lastInterstitialAt = now`. Otherwise it stores `now` under `ads.lastInterstitialAt` **before** `show()`, calls `show()` (a throw → false), drops the ad and returns true. It never awaits. App instance `interstitial` uses `InterstitialAd.createForAdRequest`, `mmkvStore`, `Date.now`, `() => useAds.getState().canRequestAds`.
  - `AdBanner({ placement: 'home' | 'files' })`: renders `null` unless `useAds` has `status === 'ready'` and `canRequestAds`. Otherwise it renders a full-width `View` (`accessibilityLabel={t('ads.label')}`) holding `BannerAd unitId={getAdsConfig().banner} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}`. `onAdFailedToLoad` → renders `null` for the rest of the mount, with no reserved height before load.
  - Home and Files: the screen root becomes `View flex:1` → `[PermissionGate …]` then `<AdBanner placement=…/>` below it, outside the scroll/list and above the tab bar. The Files snackbar keeps its absolute position over the list.
  - `result.tsx`: on the success branch, Done → `dismissAndLeave(jobId)` then `interstitial.showAfterDone()`. Failure Close, Open, Share and Save as do not call it.
  - `AdsLifecycle`: subscribes to `useToolJobs` `active`; null → non-null → `interstitial.preload()`.
  - en.json (exact copy): `ads.label` "Advertisement".

- [ ] **Step 1: Write failing tests.**
  - `interstitialCap`: `(null, 0)` true; `(1000, 180_999)` false; `(1000, 181_000)` true; `(5000, 4000)` false.
  - `interstitial` (fake ad + memory KV + `now` stub): `canRequestAds false` → `preload` never calls `create` (Review Focus 3); not loaded → `showAfterDone()` false, synchronous (Review Focus 1); loaded at t = 0 → true, and KV `ads.lastInterstitialAt === 0`; another loaded ad at t = 179 999 → false; a **new controller on the same KV** at t = 100 000 → false (restart, Review Focus 2); t = 180 000 → true; KV `500 000` with `now 10` → false and KV becomes `10`; `show` throws → false; an `ERROR` event → the next `preload` creates again.
  - `AdBanner`: ads `ready` + `canRequestAds` → a banner with the banner test unit ID; `status 'off'` → `toJSON() === null`; `onAdFailedToLoad` → `null`.
  - `home.test`/`files.test`: with ads ready, the "Advertisement" container is present; with ads off it is absent and the screens render as before.
  - `result.test`: a successful job, Done → `showAfterDone` spy called once and route left; a failed job Close → not called; Open on an output → not called (Review Focus 2).
  - `adPlacement.test` (node): reading every file under `app/reader/`, `app/tool/`, `app/scan.tsx`, `app/onboarding.tsx`, `app/(tabs)/settings.tsx` and `app/(tabs)/tools.tsx` → none contains `AdBanner` or `services/ads`; `AdBanner` occurs only in `home.tsx` and `files.tsx` under `app/`.
- [ ] **Step 2:** `npm test -- interstitialCap interstitial AdBanner home.test files.test result.test adPlacement` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat(ads): banner on Home and Files, interstitial after a finished tool at most every 3 minutes`.

### Task 5: Clear cache

**Files:**
- Create: `modules/pdf-native/android/src/main/java/com/pdfkagaz/pdfnative/CacheCleaner.kt` (pure path rules + a file walker), `src/services/files/clearCache.ts`
- Modify: `PdfNativeModule.kt` (`clearCaches`), `modules/pdf-native/src/PdfNative.types.ts`, `PdfNativeModule.ts`, `src/services/native/pdfNative.ts`, `src/test-utils/fakePdfNative.ts`, `src/services/index/fileIndexRepo.ts` (`clearThumbPaths`), `src/stores/filesStore.ts` (`resetThumbnails`)
- Test: `.../src/test/java/com/pdfkagaz/pdfnative/CacheCleanerTest.kt`, `src/services/files/__tests__/clearCache.test.ts`, `src/services/index/__tests__/fileIndexRepo.test.ts`, `src/stores/__tests__/filesStore.test.ts`

**Interfaces:**
- Produces:
  - Pure `object CacheCleaner { val CLEARED_DIRS = listOf("thumbs", "reader", "share"); const val SHARE_MIN_AGE_MS = 600_000L; fun shouldDelete(relativePath: String, lastModifiedMs: Long, nowMs: Long): Boolean }`. True for anything under `thumbs/` or `reader/`, and under `share/` when `nowMs − lastModifiedMs ≥ SHARE_MIN_AGE_MS`. False for `tools/…`, `tool-thumbs/…`, `mlkit_docscan_ui_client/…`, any other top-level entry, `..` segments and the empty path.
  - `clearCaches(): Promise<number>` (bytes freed; `Coroutine` on IO). It takes the reader-thumbnail and thumbnail lanes' locks (the same mutexes `Thumbnails`/`ReaderThumbnails` use) while deleting their dirs, and calls `releaseReaderDocument` logic first. Errors on single files are skipped.
  - `fileIndexRepo.clearThumbPaths(db): number` sets `thumb_path = null` for every row with a non-null path.
  - `filesStore.resetThumbnails(): void` → `clearThumbPaths`, sets every row's `thumbPath` to null in state, clears `thumbRetried`, and re-queues visible rows through the existing queue path.
  - `clearCache.ts`: `clearAppCache(deps = { native: pdfNative, files: useFiles, jobs: useToolJobs }): Promise<{ ok: true; bytes: number } | { ok: false; reason: 'busy' | 'failed' }>`. An active job → `busy` without calling native. A native rejection → `failed`, and thumbnails are left alone.

- [ ] **Step 1: Write failing tests.**
  - `CacheCleanerTest`: `shouldDelete("thumbs/a.jpg", 0, 1)` true; `"reader/x.pdf"` true; `"share/h/a.pdf"` with age 599 999 → false, 600 000 → true; `"tools/img-a/src-0"` false; `"tool-thumbs/x"` false; `"mlkit_docscan_ui_client/1.jpg"` false; `"thumbs/../tools/x"` false; `""` false.
  - `clearCache`: active job → `{ ok: false, reason: 'busy' }`, `clearCaches` not called (Review Focus 5); native resolves 1 234 → `{ ok: true, bytes: 1234 }` and `resetThumbnails` called once; native rejects → `failed`, `resetThumbnails` not called.
  - `fileIndexRepo` (better-sqlite3): two rows with paths, one without → returns 2, all null.
  - `filesStore`: after `resetThumbnails` every row has `thumbPath null` and the queue receives the rows again, including one that had already been retried this session.
- [ ] **Step 2:** JUnit + `npm test -- clearCache fileIndexRepo filesStore` → FAIL.
- [ ] **Step 3:** Implement (pure part first → JUnit PASS).
- [ ] **Step 4:** Prebuild + `./gradlew :pdf-native:testDebugUnitTest :app:compileDebugKotlin` → BUILD SUCCESSFUL; tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat(files): clear cache (thumbnails, reader and share copies) without touching jobs or scans`.

### Task 6: Settings screen (appearance, language, files, images, privacy)

**Files:**
- Create: `src/components/settings/SettingsSection.tsx`, `src/components/settings/RadioRow.tsx`, `src/components/settings/SwitchRow.tsx`
- Modify: `app/(tabs)/settings.tsx`, `src/i18n/en.json`
- Test: `src/__tests__/navigation/settings.test.tsx` (existing storage cases kept), `src/__tests__/screens/settings.sections.test.tsx`

**Interfaces:**
- Consumes: `useSettings` (theme, language, imageQuality, analyticsEnabled, crashReportsEnabled), `resolveLanguage`, `useAds` (`privacyOptionsRequired`, `openPrivacyOptions`), `clearAppCache` (Task 5), `formatBytes` (`src/utils/fileSize.ts`), `useToolJobs` (`active`), the existing storage section and `ScannedFoldersSection`.
- Produces:
  - `SettingsSection({ title: string; children })` with a header (`accessibilityRole="header"`). `RadioRow({ label; hint?; checked; onPress; disabled? })` uses `accessibilityRole="radio"`. `SwitchRow({ label; hint; value; onValueChange })` uses `accessibilityRole="switch"` and `accessibilityState={{ checked: value }}`. All are ≥ 48 dp.
  - The screen is one `ScrollView`, with sections in this order. **Appearance**: the theme radios, as today. **Language**: Phone language / English plus the note; selecting calls `setLanguage` then `i18n.changeLanguage(resolveLanguage(choice, getLocales() codes))`. **Files**: the output folder text, the existing storage access block and scanned folders, and Clear cache. Clear cache is a button, disabled with the `clearCacheBusy` hint while `active`; it shows a spinner while running and then a polite live-region result `clearCacheDone` (size via `formatBytes`) or `clearCacheFailed`. **Images and scans**: three quality radios plus a hint. **Privacy**: "Ad privacy choices" shown only when `privacyOptionsRequired`; it calls `openPrivacyOptions()`, and false → `adPrivacyFailed`. Then the analytics and crash switches, and the offline note. The About section comes in Task 7.
  - en.json (exact copy): `settings.sectionAppearance` "Appearance", `settings.language` "Language", `settings.languageSystem` "Phone language", `settings.languageEn` "English", `settings.languageSoon` "Marathi and Hindi are coming in a later update.", `settings.sectionFiles` "Files", `settings.outputFolder` "Saved files", `settings.outputFolderValue` "New PDFs are saved to Documents/PDFToolkit", `settings.clearCache` "Clear cache", `settings.clearCacheHint` "Removes thumbnails and temporary copies. Your PDFs are not touched.", `settings.clearCacheDone` "Freed {{size}}", `settings.clearCacheBusy` "Wait for the running tool to finish", `settings.clearCacheFailed` "Couldn't clear the cache", `settings.sectionImages` "Images and scans", `settings.quality` "Image quality", `settings.qualityCompact` "Smaller files", `settings.qualityStandard` "Standard", `settings.qualityHigh` "Sharper", `settings.qualityHint` "Used for Images to PDF and Scan. Sharper pages make bigger files.", `settings.sectionPrivacy` "Privacy", `settings.adPrivacy` "Ad privacy choices", `settings.adPrivacyFailed` "Couldn't open ad privacy choices. Check your connection and try again.", `settings.analytics` "Share anonymous usage statistics", `settings.analyticsHint` "Which tools are used and whether they worked. Never file names or contents.", `settings.crashReports` "Send crash reports", `settings.crashReportsHint` "Helps fix crashes. Never includes your files.", `settings.offlineNote` "Your files are processed on this phone and never uploaded."

- [ ] **Step 1: Write failing tests** (`settings.sections.test.tsx`, rendered as in the existing settings test).
  - Pressing "Sharper" → `useSettings.getState().imageQuality === 'high'` and the radio is checked.
  - Pressing "English" → `language === 'en'`; "Phone language" → `null`; "Marathi and Hindi are coming in a later update." is visible.
  - The "Share anonymous usage statistics" switch toggled → `analyticsEnabled false`; the crash switch → `crashReportsEnabled false`.
  - With `useAds` `privacyOptionsRequired false` → no "Ad privacy choices"; true → pressing it calls `openPrivacyOptions`; resolving false → the failure copy (Review Focus 3).
  - Clear cache with `clearCaches` resolving `2_621_440` → "Freed 2.5 MB" (whatever `formatBytes` gives, asserted through it). With `useToolJobs.setState({ active: … })` → the button is disabled and "Wait for the running tool to finish" shows (Review Focus 5).
  - "New PDFs are saved to Documents/PDFToolkit" is visible; the existing storage tests still pass.
- [ ] **Step 2:** `npm test -- settings` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat(settings): language, image quality, clear cache, ad privacy choices and telemetry opt-outs`.

### Task 7: About — version, open-source licences, privacy policy link

**Files:**
- Create: `scripts/make-licenses.mjs`, `src/config/licenses.json` (generated, committed), `src/config/nativeNotices.ts`, `src/config/appInfo.ts`, `app/licenses.tsx`
- Modify: `package.json` (`"licenses": "node scripts/make-licenses.mjs"`, `npx expo install expo-application@~57.0.3`), `app.config.ts` (`extra.privacyPolicyUrl: process.env.PRIVACY_POLICY_URL ?? null`), `app/(tabs)/settings.tsx`, `src/i18n/en.json`
- Test: `src/config/__tests__/{licenses,appInfo}.test.ts`, `src/__tests__/screens/{settings.sections,licenses}.test.tsx`

**Interfaces:**
- Produces:
  - `make-licenses.mjs`: runs `npm ls --omit=dev --all --json`, collects unique `name@version`, and reads `license` (string, or SPDX of an object/array joined with " OR ") from each `node_modules/<name>/package.json` (missing → `"UNKNOWN"`). It excludes the root and `pdf-native` (in-repo) and writes `[{ name, version, license }]` sorted by name then version, 2-space JSON plus a newline.
  - `nativeNotices.ts`: `NATIVE_NOTICES: { name: string; license: string }[]`, taken from `./gradlew :app:dependencies --configuration releaseRuntimeClasspath` top-level groups: AndroidX (Apache-2.0), Google Play services / ML Kit / Google Mobile Ads SDK / UMP ("Google APIs Terms of Service"), PdfiumAndroid as used by react-native-pdf (its license from its POM), MMKV (BSD-3-Clause), Hermes and React Native (MIT), Kotlin (Apache-2.0). Every entry needs a non-empty license.
  - `appInfo.ts`: `appVersion(): { version: string; build: string }` from `expo-application` `nativeApplicationVersion` / `nativeBuildVersion`, falling back to `Constants.expoConfig.version` / `'0'`; `privacyPolicyUrl(): string | null` (only `https:` URLs, otherwise null).
  - `/licenses` route: header `licenses.title`, two `FlashList` sections ("Android libraries", "JavaScript libraries"), rows `licenses.item`, and a Back button (48 dp, labelled).
  - Settings **About** section: `settings.version`; `settings.licenses` → `router.push('/licenses')`; `settings.privacyPolicy` → `Linking.openURL(url)` when set, otherwise a disabled row with `settings.privacyPolicyMissing`.
  - en.json (exact copy): `settings.sectionAbout` "About", `settings.version` "Version {{version}} ({{build}})", `settings.licenses` "Open-source licences", `settings.privacyPolicy` "Privacy policy", `settings.privacyPolicyMissing` "Available soon", `licenses.title` "Open-source licences", `licenses.native` "Android libraries", `licenses.js` "JavaScript libraries", `licenses.item` "{{name}} {{version}} · {{license}}", `licenses.back` "Back".

- [ ] **Step 1: Write failing tests.**
  - `licenses`: the JSON contains `react-native` (MIT) and `@cantoo/pdf-lib`, has no `jest`/`eslint`/`typescript`, is sorted, and its `name@version` pairs are unique; every `NATIVE_NOTICES` license is non-empty.
  - `appInfo` (mocked expo-application `1.0.0`/`7`) → `{ version: '1.0.0', build: '7' }`; `privacyPolicyUrl` with `http://x` → null, `https://example.org/p` → the URL, absent → null.
  - Settings: "Version 1.0.0 (7)"; "Open-source licences" → pathname `/licenses`; no URL → "Available soon" and pressing it does not call `Linking.openURL`; with a URL → called with it.
  - `/licenses` renders "react-native" with "MIT" and the Android section.
- [ ] **Step 2:** `npm run licenses`, then `npm test -- licenses appInfo settings` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat(settings): about section with version, open-source licences and privacy policy link`.

### Task 8: Scanner and pickers keep working after an activity recreation

**Files:**
- Modify (expected; confirm by root cause): `modules/pdf-native/android/src/main/java/com/pdfkagaz/pdfnative/PdfNativeModule.kt`, `ScanDocumentContract.kt`, `DocumentScanner.kt`
- Test: a JVM test for any pure part the fix introduces; device evidence otherwise

**Interfaces:**
- Produces: no TS API change. `scanDocument`, `pickImages`, `pickPdfDocuments`, `saveCopyAs` and `pickFolder` work after a `MainActivity` recreation exactly as on a fresh start.

- [ ] **Step 1: Reproduce (superpowers:systematic-debugging).** Debug build on `Pixel_10a`. Home → Scan works and Back cancels. Then recreate the activity with `adb shell settings put system font_scale 1.15` (restore 1.0 after) or `adb shell settings put global always_finish_activities 1` (restore 0). Home → Scan → expect "Couldn't open the scanner". Capture `adb logcat -d | grep -E "PdfNative|AndroidRuntime|ActivityResult"`. Repeat for Images to PDF (picker), Merge → Browse, Save as and Settings → Add folder.
- [ ] **Step 2: Find the root cause before any fix.** Leads, checked in this order with temporary logs (exception class only):
  - (a) `AppContext.onHostResume` re-registers contracts only when `hostWasDestroyed`. A config-change recreation may not set it, so the registry's `ON_DESTROY` observer `unregister`s the keys, and `launch` throws `IllegalStateException("Attempting to launch an unregistered ActivityResultLauncher…")` (`node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/activityresult/AppContextActivityResultRegistry.kt:223`).
  - (b) `getStartScanIntent(activity)` given a destroyed activity.
  - (c) The `scanContract.pendingSender` state.
  Write the cause in the commit body.
- [ ] **Step 3: Fix at the root.** Expected for (a): re-register the five launchers when the activity changes. Use an `OnActivityEntersForeground` (or `OnActivityDestroys`) hook that clears a `launchersReady` flag and re-runs the registrations on the next launch through `appContext`'s registry, or catch that exact `IllegalStateException` once, re-register and relaunch. Any pure helper gets a JVM test. Remove the temporary logs.
- [ ] **Step 4: Verify on device.** After recreation (both triggers), Scan opens the ML Kit UI, the image picker opens, the PDF picker opens, Save as opens, and Add folder opens (screencaps in scratchpad), with no `FATAL EXCEPTION`. Restore the settings. `./gradlew :pdf-native:testDebugUnitTest` → pass; typecheck, lint, test, format:check → pass.
- [ ] **Step 5:** Commit `fix(pdf-native): scanner and pickers work again after the activity is recreated`.

### Task 9: Per-phase tool timings and the 100-photo hot spot

**Files:**
- Create: `src/services/tools/phaseTimer.ts`
- Modify: `src/services/tools/runTool.ts`
- Test: `src/services/tools/__tests__/{phaseTimer,runTool}.test.ts`

**Interfaces:**
- Consumes: `deps.now`, Task 1 presets.
- Produces:
  - `phaseTimer.ts`: `type ToolPhaseName = 'stage' | 'prepare' | 'read' | 'embed' | 'save' | 'publish'`; `createPhaseTimer(now: () => number): { time<T>(phase: ToolPhaseName, fn: () => Promise<T>): Promise<T>; totals(): Record<ToolPhaseName, number> }` (accumulates, also on rejection); `formatPhases(toolId: string, totals): string` → `` `[tool-phases] ${toolId} stage=${n}ms prepare=… read=… embed=… save=… publish=…` `` (all six, in that order).
  - `runTool`: native staging → `stage`, `prepareImagePage` → `prepare`, `fs.readBytes` → `read`, pdf-lib work (`imagesToPdf`/merge/split/organise minus nested reads) → `embed`, `fs.writeBytes` → `save`, `publishToolOutput` → `publish`. One `console.log(formatPhases(...))` follows the existing `[tool]` line, on success only.
  - **Sticky downgrade** (the expected hot spot: with 100 heavy photos nearly every page is over its budget share and is decoded twice): once a page was re-prepared at the smaller preset, every later page of that job is prepared directly at the smaller preset (one `prepareImagePage` call per page). The `totalTooLarge` check is unchanged.
- [ ] **Step 1: Write failing tests.**
  - `phaseTimer`: with a fake clock, two `prepare` calls of 30 and 20 ms plus a rejected `read` of 5 ms → totals `prepare 50`, `read 5`; `formatPhases('merge', …)` equals the exact string with all six keys.
  - `runTool`: a 5-image job where page 0's prepared size exceeds its share → `prepareImagePage` is called 6 times (page 0 twice, pages 1–4 once, at `(1600, 75)` for standard); a job where no page exceeds → 5 calls at `(2400, 85)`; the success log contains `[tool-phases] images-to-pdf` and no `.pdf`/`/` text.
- [ ] **Step 2:** `npm test -- phaseTimer runTool` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4: Measure.** Release build (`./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`) on `Pixel_Fold_API_34`. Push 100 photos (4000 × 3000 JPEG, generated with `sips` from the M5 fixture into the scratchpad) and run Images to PDF with all 100, Standard quality. Read `adb logcat -s ReactNativeJS | grep tool`. Record the total and per-phase times against M5's 192–248 s. If one phase other than `prepare` is still > 40 % of the total, profile it (Hermes sampling profiler through React Native DevTools on a debug build) and fix a JS hot spot only if it is clear and testable. Otherwise record the numbers, and keep "100 heavy photos on a physical mid-range phone" in the user checklist.
- [ ] **Step 5:** Typecheck, lint, test, format:check → pass. Commit `perf(tools): per-phase timings and one decode per page once a job's pages run over budget` (the body holds the before/after numbers).

### Task 10: Release hardening — backup rules, R8 and log stripping, size, EAS profile, RELEASE.md

**Files:**
- Create: `plugins/withBackupRules.js`, `plugins/__tests__/withBackupRules.test.ts`, `docs/RELEASE.md`
- Modify: `app.json` (`android.allowBackup: false`; `expo-build-properties` android `enableMinifyInReleaseBuilds: true`, `enableShrinkResourcesInReleaseBuilds: true`, `extraProguardRules`), `app.config.ts` (add `./plugins/withBackupRules`), `eas.json`, `src/config/__tests__/appConfig.test.ts`

**Interfaces:**
- Produces:
  - `withBackupRules.js`: writes `res/xml/data_extraction_rules.xml`: `<data-extraction-rules>` with `<cloud-backup>` and `<device-transfer>`, each holding `<exclude domain="root" path="."/>`, `file`, `database`, `sharedpref`, `external`. It sets `android:dataExtractionRules="@xml/data_extraction_rules"` and `android:fullBackupContent="false"` on `<application>`. It exports `applyBackupRules(manifest)` and `backupRulesXml(): string` for tests.
  - `extraProguardRules` (exact): `-assumenosideeffects class android.util.Log { public static int d(...); public static int v(...); }` plus the keep rules the release build proves necessary. Start with `-keep class org.wonday.pdf.** { *; }`, `-keep class io.legere.pdfiumandroid.** { *; }` (or the package the PdfiumAndroid AAR uses — check `unzip -l` of its classes.jar) and `-keep class com.shockwave.** { *; }` only if present. Each added rule is justified in RELEASE.md.
  - `eas.json`: `production` gets `"env": { "APP_ENV": "production" }` and keeps `autoIncrement` and `app-bundle`. `production-saf` extends it. `preview` gets `"env": { "APP_ENV": "preview" }`. A `submit.production.android` entry has `"track": "internal"`.
  - `docs/RELEASE.md` sections: **Code-side checklist** (each §10.2 item with its status after Task 11); **User actions** (below); **Build** (exact `eas build -p android --profile production` and `production-saf` commands and EAS env vars: `ADMOB_ANDROID_APP_ID`, `ADMOB_BANNER_ID`, `ADMOB_INTERSTITIAL_ID`, `PRIVACY_POLICY_URL`, the file variable `GOOGLE_SERVICES_JSON`); **Data safety notes** (on-device processing; Ads SDK: advertising ID, app interactions, diagnostics, approximate location by IP per Google's guidance; Firebase Analytics automatic events and app-instance ID; Crashlytics crash traces; ML Kit `transport-*`/firebase-components API usage counts without content; the release permission list from Task 11); **All Files Access declaration** text (one paragraph) and the demo-video shot list; **Size** (Task 11 numbers); **Known limitations** (ledger items for the user's physical-device checks).
- [ ] **Step 1: Write failing tests.**
  - `withBackupRules.test`: `backupRulesXml()` contains both `<cloud-backup>` and `<device-transfer>`, each with 5 excludes (root, file, database, sharedpref, external); `applyBackupRules` sets both attributes and is idempotent.
  - `appConfig.test`: `allowBackup === false`; plugins contain `./plugins/withBackupRules`; the build-properties android block has minify and shrink true and `extraProguardRules` contains `assumenosideeffects class android.util.Log`.
- [ ] **Step 2:** `npm test -- withBackupRules appConfig` → FAIL.
- [ ] **Step 3:** Implement the plugin and config, plus RELEASE.md with placeholders only for Task 11's measured numbers (marked "filled by Task 11").
- [ ] **Step 4: Release build compiles and runs minified.** `npx expo prebuild --platform android --clean && cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` → BUILD SUCCESSFUL. Install on `Pixel_10a` and run a short crash check: open a PDF in the reader (page renders), merge two files, open Settings. A `ClassNotFoundException`/`NoSuchMethodError` in logcat → add the narrowest keep rule, rebuild and repeat. `adb logcat -d | grep "PdfView"` while reading → no `drawPdf path:` lines (path logging gone).
- [ ] **Step 5:** Typecheck, lint, test, format:check → pass. Commit `build(release): no backups of the index, R8 with log stripping, EAS production profile and release guide`.

### Task 11: Release build, 16 KB check, manifest check, size and emulator smoke

**Files:**
- Modify: `docs/RELEASE.md` (measured numbers and statuses); any Task 1–10 file only if a step fails (with a test where a unit test can express it).

- [ ] **Step 1: Builds.** With JAVA_HOME/ANDROID_HOME set: `npx expo prebuild --platform android --clean`, then `cd android && ./gradlew :pdf-native:testDebugUnitTest bundleRelease assembleRelease`. Both the AAB and a universal APK must reach BUILD SUCCESSFUL (the local release keystore is the debug one; the real upload key is a user action). Repeat `assembleRelease` with `APP_VARIANT=play-saf` → succeeds.
- [ ] **Step 2: Size.** Record the `ls -l` of the AAB and APK. Get bundletool (`com.android.tools.build:bundletool` all-jar from Maven Central into the scratchpad), then run `java -jar bundletool.jar build-apks --bundle app-release.aab --output s.apks --local-testing` and `get-size total --apks s.apks --dimensions=ABI`. The **arm64-v8a download size** is the number compared with the §4 40 MB target. Record the M5 58.4 MB APK figure next to it, and the top 10 entries of `unzip -lv app-release.apk` (lib/*.so, dex, assets/index.android.bundle). Over 40 MB → list the largest contributors and options in RELEASE.md as a user decision; it does not block.
- [ ] **Step 3: 16 KB.** `zipalign -c -P 16 -v 4 app-release.apk | grep "lib/arm64-v8a"` → every `.so` OK, and `llvm-objdump -p` on each unzipped arm64 `.so` → every `LOAD` `align 2**14`. List the `.so` set against M5 (the expected difference is none from ads). **Firebase variant:** in a scratch copy of the repo (`git worktree add` in the scratchpad), put a placeholder `google-services.json` (fake project, package `com.pdfkagaz.pdftoolkit`), then prebuild and `assembleRelease -PreactNativeArchitectures=arm64-v8a`. The `libcrashlytics*.so` files must pass the same two checks. Record the result, then delete the worktree. The placeholder is never committed.
- [ ] **Step 4: Manifest.** `aapt2 dump xmltree --file AndroidManifest.xml app-release.apk`: record every `uses-permission` (with `maxSdkVersion`). Checks: `WRITE_EXTERNAL_STORAGE` maxSdk 29 and `READ_EXTERNAL_STORAGE` 32 (ledger recheck); no `CAMERA`, `READ_MEDIA_*`, `SYSTEM_ALERT_WINDOW`, `ACCESS_WIFI_STATE`, `DOWNLOAD_WITHOUT_NOTIFICATION` or `VIBRATE`; `allowBackup=false` and `dataExtractionRules` present; the AdMob `APPLICATION_ID` meta-data is the test ID; the PDF VIEW/SEND filters have no `exp+` scheme. The ads-SDK permissions go into RELEASE.md data safety. Do the same for the play-saf APK (no `MANAGE_EXTERNAL_STORAGE`).
- [ ] **Step 5: Smoke on `Pixel_10a`** (fresh `adb uninstall`, a release APK built with `ADS_DEBUG_GEOGRAPHY=EEA`; first run without a test device ID, so read the UMP hashed device ID from `adb logcat | grep -i "addTestDeviceHashedId"`, then rebuild with `ADS_TEST_DEVICE_IDS=<it>`). Screencaps go to the scratchpad.
  - (a) After onboarding the UMP consent form appears. Choose "Do not consent" (or "Manage options → reject"): Home/Files show no banner. Settings shows "Ad privacy choices"; open it and consent → the banner (test ad) appears on Home and Files.
  - (b) The reader, Tools, a tool flow, `/scan` and Settings show no ad.
  - (c) Merge two files → result → Done → a test interstitial shows. Run another tool within 3 minutes → Done → none. Force-stop and relaunch within the 3 minutes → another tool → Done → none. After ≥ 3 minutes since the last one → shown. Result → Open → reader with no ad.
  - (d) Offline: `adb shell cmd connectivity airplane-mode enable`, cold start → no banner, no blank gap, merge works, Done leaves at once, no crash; then restore.
  - (e) Settings effects: Dark theme applies at once; Image quality "Smaller files" → Images to PDF with 3 photos gives a smaller output than Standard (sizes recorded); Clear cache → "Freed …" and Files thumbnails regenerate; the analytics/crash switches persist across restart; "Open-source licences" lists packages; the version shows.
  - (f) After the Task 8 recreation trigger, Scan opens again.
- [ ] **Step 6: Smoke on `Pixel_Fold_API_34`.** Install the same APK. Check the consent form and banner on the unfolded layout (the banner fits its width, no overlap with the tab bar), one interstitial after Done, the SAF onboarding path still working, and no ad in the reader.
- [ ] **Step 7:** Fill in RELEASE.md (sizes, `.so` list, permissions, statuses). If any step needed a fix, run `npm test && npm run typecheck && npm run lint && npm run format:check` and commit the fix as `fix: …`. Commit `docs(release): measured size, 16 KB and manifest results`. Report pass/fail per step with screencap paths and numbers, plus the user actions.

**User actions this milestone depends on (also in RELEASE.md):** AdMob account, app and real banner/interstitial unit IDs, set as EAS env vars, plus a GDPR/US-states message configured in AdMob Privacy & messaging. A Firebase project with the Android app `com.pdfkagaz.pdftoolkit`, its `google-services.json` uploaded as the EAS file variable `GOOGLE_SERVICES_JSON` (Crashlytics turns on with the next build). Privacy policy hosted at an https URL and set as `PRIVACY_POLICY_URL`. Upload keystore / Play App Signing through `eas credentials`. Play Console: data safety form, All Files Access declaration and demo video, content rating, target audience, store listing (8 screenshots, feature graphic, descriptions), internal testing track first. Final app name and package ID (§10.4). Physical-device checks from the ledger: Android 11+ and Android 9 phones, a ≤ 3 GB RAM phone with the 50 MB fixture, real-camera scan, 100 real photos, API 24–29 share/print and photo picker fallback, merge/split < 10 s.

## Self-Review

1. **Spec coverage.** A-01: theme, language, default save folder (info), scan quality, clear cache → Tasks 1, 5, 6. A-03: banner on Home/Files, interstitial after a tool with a 3-minute cap, UMP → Tasks 3, 4. A-04: Crashlytics plus anonymous tool events without names → Task 2. §1/§10.3 no ads in the reader, never interrupt reading → Task 4 (`adPlacement.test`, Done-only). §4 privacy → Tasks 2, 10; app size → Tasks 10, 11; accessibility and i18n → all UI tasks. §5 ads permissions → Tasks 3, 11. §6 EAS production AAB → Tasks 10, 11. §8 Settings contents, `AdBanner`, the result's "after leaving" → Tasks 4, 6, 7. §10.2: test IDs and UMP in EU test mode (Tasks 3, 11), signed AAB profile (Task 10, signing is a user action), 16 KB (Task 11), privacy policy URL, Play Console and store listing (user actions in RELEASE.md). Ledger carries: allowBackup (Task 10), WRITE maxSdk recheck (Task 11 Step 4), react-native-pdf path logging (Task 10), APK size (Tasks 10, 11), per-phase timings and the 100-photo job (Task 9), scanner after recreation plus M4 pickers (Task 8), ML Kit telemetry and the data-safety form (Task 10), SYSTEM_ALERT_WINDOW (Task 11).
2. **Step scan.** Every code step names its file, signature and pinned values. The two investigative tasks (8, 9) have a reproduction, ordered leads, an expected fix and a measurable gate rather than an open "investigate".
3. **Type consistency.** `ImageQuality` / `IMAGE_QUALITY_PRESETS` (Tasks 1, 6, 9), `KeyValueStore.getNumber` (Tasks 1, 4), `Telemetry` / `toolFinishedEvent` / `onJobFinished` (Task 2), `useAds` `{ status, canRequestAds, privacyOptionsRequired, start, openPrivacyOptions }` (Tasks 3, 4, 6), `interstitial.preload/showAfterDone` (Task 4), `clearAppCache` / `resetThumbnails` / `clearCaches` (Tasks 5, 6) are used with the same names everywhere.
4. **Review Focus.** Each line names its owning tests.
5. **Proportion.** Signatures, values and assertions only; no function bodies beyond the cap rule and the config shapes the tests pin.
