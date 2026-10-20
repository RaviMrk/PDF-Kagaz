# Milestone 2 — Storage Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app finds every PDF on the phone (All Files Access) or in user-picked folders (SAF), shows the cached list instantly, refreshes it in the background and on foreground, and lets the user search, sort, favourite, rename, delete, duplicate, inspect and move files — F-01 to F-05 and F-07.

**Architecture:** A local Expo module `modules/pdf-native` (Kotlin) does all file-system and PdfRenderer work off the UI thread; pure Kotlin rules (folder skipping, walking, naming, cache keys) are JUnit-tested. JS reaches it only through a typed wrapper `src/services/native/pdfNative.ts`. Two `StorageProvider` implementations (`FullAccessProvider`, `SafProvider`) sit on that wrapper; a sync Drizzle repository diffs scan results into the `files` table; Zustand stores (`storageStore`, `filesStore`) drive the screens. The `play-saf` variant is the same app config evaluated with `APP_VARIANT=play-saf`, which blocks `MANAGE_EXTERNAL_STORAGE` through a config plugin.

**Tech Stack:** Expo SDK 57 (`expo@~57.0.30`, RN 0.86.3, New Architecture), Expo Modules API (Kotlin, `AsyncFunction … Coroutine`, `Events`, `RegisterActivityContracts`), Android `PdfRenderer`, `DocumentsContract`, `MediaStore`; `@expo/config-plugins` 57 (`withAndroidManifest`); expo-sqlite + drizzle-orm 0.45; Zustand 5; `@shopify/flash-list` 2.0.2 (the SDK 57 bundled version, New-Arch only); `expo-image` (thumbnails); `@cantoo/pdf-lib` 2.11.x (fixture generation only in M2); Jest (jest-expo) + better-sqlite3; JUnit 4.13.2.

**Spec:** `docs/REQUIREMENTS.md` (sections 3.1, 3.4 A-02, 4, 5, 7.1–7.3, 8, 9 milestone 2, 10.1)

## Global Constraints

- Android only; no iOS code. minSdk 24, targetSdk 36, compileSdk 36. Dev build, New Architecture.
- TypeScript `strict: true`; `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check` pass at the end of every task.
- All user-facing strings via i18next `src/i18n/en.json`; touch targets ≥ 48 dp; every pressable has an `accessibilityLabel`; no `allowFontScaling={false}`.
- Screens never call native code; storage access only through `src/services/storage/StorageProvider.ts` (CLAUDE.md rules). Routes only in root `app/`.
- Native module: folder `modules/pdf-native`, Kotlin package `com.pdfkagaz.pdfnative`, module name `PdfNative`. Every `AsyncFunction` that touches disk or PdfRenderer is a `Coroutine` that runs inside `withContext(Dispatchers.IO)` (F-02 "off the UI thread"). Pure Kotlin classes (`ScanRules`, `PdfWalker`, `FileNames`, `ThumbKey`) import nothing from `android.*` so JUnit runs on the JVM.
- Native errors are `CodedException`s with exactly these codes: `ERR_FILE_NOT_FOUND`, `ERR_PDF_ENCRYPTED`, `ERR_PDF_INVALID`, `ERR_PERMISSION_DENIED`, `ERR_FILE_EXISTS`, `ERR_INVALID_NAME`, `ERR_PASSWORD_UNSUPPORTED`, `ERR_NO_ACTIVITY`.
- Never overwrite a file: duplicate/move write to a hidden temp (`.<name>.part`) in the destination folder, then rename into place; name collisions get ` (2)`, ` (3)`…
- App output folder: `Documents/PDFToolkit/` on primary storage.
- Skip rules (F-02): any file or folder whose name starts with `.`; `<volume>/Android/data`, `<volume>/Android/obb` (case-insensitive); `lost+found`. `Android/media` is NOT skipped (WhatsApp Documents lives there on Android 11+). Symlinks are not followed.
- Privacy: no file names or paths in logs; dev-only timing logs may print counts and milliseconds.
- Install Expo/native packages with `npx expo install <pkg>`.
- Java for Gradle: `export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.20.1+1/Contents/Home`; `export ANDROID_HOME=~/Library/Android/sdk`. `android/` is generated (gitignored): after native/config changes run `npx expo prebuild --platform android --clean`.
- Commit after each task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Decisions this plan makes (spec leaves them open):**
- `play-saf` = `APP_VARIANT=play-saf` env → `app.config.ts` passes `allFilesAccess: false` to the plugin, adds `MANAGE_EXTERNAL_STORAGE` to `android.blockedPermissions`, sets `extra.allFilesAccessEnabled=false`; EAS profile `production-saf` sets that env. No Gradle productFlavors (CNG would regenerate them).
- `scanPdfs` returns `ScanResult { files, scannedRoots, failedRoots }` instead of the bare `PdfFileInfo[]` in spec 7.3, so an unreadable root (revoked grant, unmounted SD card) never wipes its part of the index.
- F-04 "only changed folders": foreground return runs a **quick scan** — native re-lists (non-recursively) only folders whose directory mtime differs from the stored stamp in the new `folder_stamps` table, plus the hot folders (Download, Documents, Documents/PDFToolkit, both WhatsApp Documents paths). Cold start (after cache load) and pull-to-refresh run a **full scan**. SAF mode's quick scan is a full scan of the picked roots (they are few). A file edited in place in an unchanged folder is picked up on the next full scan.
- Page count and encryption are filled lazily by the thumbnail queue, not during the scan (keeps 1,000 files < 5 s).
- `generateThumbnail` / page numbers are 1-based (matches `files.last_page`). Password-protected files get `ERR_PDF_ENCRYPTED` and a lock placeholder; `getPageCount(uri, password)` with a password returns `ERR_PASSWORD_UNSUPPORTED` until PdfBox lands (M3/M7).
- F-06 (Open with) is deferred to M3, where the spec registers the intent. Long-press multi-select (spec 8) is deferred to M4 (tool file picking).
- Switching mode (SAF ↔ full) drops the other mode's rows (`source` `saf` vs `scan`); `output` rows stay.
- Android 11+ SAF cannot grant the root of internal storage or the Download root; the UI copy says so and suggests Documents / WhatsApp Documents.

## Review Focus

1. Grant revoked or SD card removed between or during scans → that root lands in `failedRoots`/is not scanned, its rows stay in the index, the rest of the list refreshes, no crash. (Tests in Task 5 and Task 6.)
2. File deleted or renamed by another app after the scan → thumbnail/action gets `ERR_FILE_NOT_FOUND`, the row disappears with a "This file no longer exists" message, no crash. (Test in Task 8.)
3. 1,000+ PDFs → walker < 2 s on JVM, DB diff < 1 s, search+sort < 100 ms, on-device full scan < 5 s. (Tests in Tasks 2, 5, 7; device check in Task 11.)
4. Non-ASCII and awkward names (`अहवाल.pdf`, NFD-composed Devanagari, spaces, `#`, `%`) → found, displayed, searchable, renamable; IDs stable. (Tests in Tasks 2, 5, 7.)
5. Encrypted or corrupted PDFs in the list → lock / broken-file placeholder, no endless thumbnail retries, other thumbnails keep loading. (Test in Task 7.)

---

### Task 1: Test fixtures

**Files:**
- Create: `scripts/make-fixtures.mjs`, `__fixtures__/*.pdf` (generated, committed)
- Modify: `package.json` (script `fixtures:generate`), `.gitignore` (add `modules/pdf-native/android/build/`)
- Test: `src/__tests__/fixtures.test.ts`

**Interfaces:**
- Produces fixture files used by later tasks and the Task 11 smoke test: `__fixtures__/one-page.pdf` (1 page, text "Hello PDF Toolkit"), `__fixtures__/two-hundred-pages.pdf` (200 pages, "Page N"), `__fixtures__/protected.pdf` (1 page, `userPassword: 'secret'`, `ownerPassword: 'owner'`), `__fixtures__/mixed-sizes.pdf` (3 pages: A4 portrait, Letter landscape, A4 rotated 90°), `__fixtures__/corrupted.pdf` (first 400 bytes of one-page.pdf), `__fixtures__/अहवाल.pdf` (2 pages). The 50 MB scanned and outline fixtures from spec 10.1 are deferred to the milestones that need them (M3/M7).

- [ ] **Step 1:** `npx expo install @cantoo/pdf-lib` (expect 2.11.x). Add script `"fixtures:generate": "node scripts/make-fixtures.mjs"`.
- [ ] **Step 2: Write the failing test** (`@jest-environment node`, reads files with `fs`, loads with `PDFDocument` from `@cantoo/pdf-lib`):
  - page counts: one-page 1, two-hundred-pages 200, mixed-sizes 3, `अहवाल.pdf` 2
  - mixed-sizes: page 1 size ≈ 595×842, page 2 ≈ 792×612, page 3 `getRotation().angle === 90`
  - `(await PDFDocument.load(protectedBytes, { ignoreEncryption: true })).isEncrypted === true`
  - `PDFDocument.load(corruptedBytes)` rejects
  - `fs.readdirSync('__fixtures__')` contains `'अहवाल.pdf'` (NFC)
- [ ] **Step 3:** Run `npm test -- fixtures` → FAIL (files missing).
- [ ] **Step 4:** Implement `scripts/make-fixtures.mjs` (ESM, Node ≥ 18 so `crypto.getRandomValues` exists for `encrypt`); set creation/modification date to `new Date(0)`; write each file; write the Marathi filename with `'अहवाल.pdf'.normalize('NFC')`. Run `npm run fixtures:generate`.
- [ ] **Step 5:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 6:** Commit `test: generated PDF fixtures (multi-page, encrypted, corrupted, Marathi name)`.

### Task 2: pdf-native module — scanning and access

**Files:**
- Create (via generator, then edit): `modules/pdf-native/expo-module.config.json`, `modules/pdf-native/index.ts`, `modules/pdf-native/src/PdfNativeModule.ts`, `modules/pdf-native/src/PdfNative.types.ts`, `modules/pdf-native/android/build.gradle`, `modules/pdf-native/android/src/main/java/com/pdfkagaz/pdfnative/PdfNativeModule.kt`
- Create: `.../pdfnative/ScanRules.kt`, `.../pdfnative/PdfWalker.kt`, `.../pdfnative/Volumes.kt`, `.../pdfnative/SafWalker.kt`, `.../pdfnative/Errors.kt`
- Create: `src/services/native/pdfNative.ts`, `src/test-utils/fakePdfNative.ts`
- Modify: `jest.setup.js`
- Test: `modules/pdf-native/android/src/test/java/com/pdfkagaz/pdfnative/ScanRulesTest.kt`, `.../PdfWalkerTest.kt`, `src/services/native/__tests__/pdfNative.test.ts`

**Interfaces:**
- Produces (TS, `modules/pdf-native/src/PdfNative.types.ts`, re-exported by `modules/pdf-native/index.ts` and `src/services/native/pdfNative.ts`):
  - `PdfFileInfo = { uri: string; name: string; folder: string; parentUri: string; parentModifiedAt: number; sizeBytes: number; modifiedAt: number }` — `uri` is `Uri.fromFile(file).toString()` (percent-encoded `file:///storage/emulated/0/…`) in full mode or a tree-based document URI (`content://…/tree/<treeId>/document/<docId>`) in SAF mode; `folder` is the display folder: path relative to the volume root (`''` for the root; removable volumes prefixed with the volume description, e.g. `SD card/Download`), or `<treeLabel>/<sub>` for SAF; `parentUri` is the parent folder in the same URI form; times are epoch ms.
  - `ScanResult = { files: PdfFileInfo[]; scannedRoots: string[]; failedRoots: string[] }` (roots in the same URI form as file uris, no trailing slash)
  - `FolderStamp = { uri: string; modifiedAt: number }`
  - `FolderChange = { uri: string; exists: boolean; modifiedAt: number; files: PdfFileInfo[] }`
  - `ScanProgressEvent = { scannedFolders: number; found: number }`
  - `PickedFolder = { uri: string; label: string }`
- Produces (native functions this task implements): `scanPdfs(roots?: string[] | null): Promise<ScanResult>` (no roots → every mounted volume root; `file://` roots walked with `PdfWalker`, `content://` tree roots walked with `SafWalker`; a root that can't be read goes to `failedRoots`), `scanChangedFolders(known: FolderStamp[]): Promise<FolderChange[]>` (checks `known` ∪ existing hot folders; returns only folders that vanished (`exists:false`, only if in `known`) or whose mtime differs/are unknown, with their PDFs listed non-recursively; ignores `content://` stamps), `hasAllFilesAccess(): Promise<boolean>` (API ≥ 30 `Environment.isExternalStorageManager()`, else `READ_EXTERNAL_STORAGE` granted), `openAllFilesAccessSettings(): Promise<void>` (API ≥ 30 `Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` with `package:<pkg>`, fallback `ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION`; via `appContext.currentActivity`, else `ERR_NO_ACTIVITY`; no-op below 30). Event `onScanProgress` (`ScanProgressEvent`), throttled to one per 200 ms plus a final one.
- Produces (JS wrapper `src/services/native/pdfNative.ts`):
  - `interface PdfNativeApi` = all native functions of Tasks 2 and 3 with the signatures listed there, plus `addScanProgressListener(cb: (e: ScanProgressEvent) => void): { remove(): void }`
  - `export const pdfNative: PdfNativeApi` (delegates to the module default export from `../../../modules/pdf-native`)
  - `type PdfNativeErrorCode` = union of the Global Constraints codes; `isPdfNativeError(e: unknown, code?: PdfNativeErrorCode): e is Error & { code: PdfNativeErrorCode }`
  - `src/test-utils/fakePdfNative.ts`: `createFakePdfNative(overrides?: Partial<PdfNativeApi>): jest.Mocked<PdfNativeApi>` (defaults: empty scan result, `hasAllFilesAccess` → false, `pickFolder` → null, `getPersistedFolderUris` → []), `nativeError(code: PdfNativeErrorCode, message?: string): Error` (Error with `.code`), `createFakeNativeModule()` (the same fakes shaped like the raw module: no `addScanProgressListener`, plus `addListener(name, cb)` returning `{ remove: jest.fn() }`; used by `jest.setup.js`).
- Produces (Kotlin, pure): `object ScanRules { val HOT_FOLDERS: List<String>; fun shouldSkipDir(name: String, relPath: String): Boolean; fun isPdf(name: String): Boolean; fun displayFolder(relDir: String, volumePrefix: String?): String; fun volumeRootFromAppDir(appDirPath: String?): String? }`; `class PdfWalker(onProgress: (scannedFolders: Int, found: Int) -> Unit = { _, _ -> }) { fun walk(root: java.io.File): List<FoundPdf>; fun listDir(dir: java.io.File): List<FoundPdf> }`, `data class FoundPdf(val file: File, val relDir: String)`.
- Hot folders (relative to primary volume): `Download`, `Documents`, `Documents/PDFToolkit`, `Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents`, `WhatsApp/Media/WhatsApp Documents`.

- [ ] **Step 1:** Generate: `EXPO_NONINTERACTIVE=1 npx create-expo-module@latest pdf-native --local --barrel --name PdfNative --package com.pdfkagaz.pdfnative --platform android --features AsyncFunction Event`. Confirm it landed in `modules/pdf-native/` (move it there if the CLI used another path) and delete the generated example functions/views. Confirm the Gradle project name: `cd android && ./gradlew projects | grep -i pdf` → `:pdf-native` (if different, use that name in every Gradle command of this plan). Add to `modules/pdf-native/android/build.gradle`: `testImplementation 'junit:junit:4.13.2'`.
- [ ] **Step 2: Write failing JUnit tests.** `ScanRulesTest`:
  - `shouldSkipDir(".thumbnails", ".thumbnails")` true; `shouldSkipDir("data", "Android/data")` true; `shouldSkipDir("OBB", "android/OBB")` true; `shouldSkipDir("media", "Android/media")` false; `shouldSkipDir("lost+found", "lost+found")` true; `shouldSkipDir("Download", "Download")` false
  - `isPdf("a.PDF")` true; `isPdf(".hidden.pdf")` false; `isPdf("a.pdf.txt")` false
  - `displayFolder("", null)` == `""`; `displayFolder("Download/Reports", null)` == `"Download/Reports"`; `displayFolder("Download", "SD card")` == `"SD card/Download"`
  - `volumeRootFromAppDir("/storage/emulated/0/Android/data/com.x/files")` == `"/storage/emulated/0"`; `volumeRootFromAppDir("/storage/1A2B-3C4D/Android/data/com.x/files")` == `"/storage/1A2B-3C4D"`; `volumeRootFromAppDir(null)` == null (unmounted SD card — Review Focus 4)
  `PdfWalkerTest` (JUnit `TemporaryFolder`): tree `Download/a.pdf`, `Download/अहवाल.pdf`, `Download/b c#1%.PDF`, `Download/notes.txt`, `Download/.hidden/x.pdf`, `.trash/y.pdf`, `Android/data/com.app/z.pdf`, `Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/w.pdf`, `Documents/Deep/Deeper/d.pdf`, plus a symlink `Documents/loop → <root>`:
  - `walk(root)` names == {`a.pdf`, `अहवाल.pdf`, `b c#1%.PDF`, `w.pdf`, `d.pdf`} (Review Focus 4), terminates despite the loop, `relDir` of `d.pdf` == `Documents/Deep/Deeper`
  - progress callback fired with final `found == 5`
  - `listDir(Download)` returns the 3 Download PDFs only (non-recursive)
  - 1,000 PDFs spread over 50 folders → `walk` < 2,000 ms (Review Focus 3)
  - root that does not exist → empty list, no exception
- [ ] **Step 3:** Run `cd android && ./gradlew :pdf-native:testDebugUnitTest` → FAIL (classes missing).
- [ ] **Step 4:** Implement `ScanRules.kt`, `PdfWalker.kt` (iterative stack over `File.listFiles()`, `null` listing → skip; skip symlinks via `java.nio.file.Files.isSymbolicLink`; track visited canonical paths).
- [ ] **Step 5:** Run the Gradle tests → PASS.
- [ ] **Step 6:** Implement `Volumes.kt` (`mountedVolumeRoots(context): List<Pair<File, String?>>` = `context.getExternalFilesDirs(null)` mapped through `ScanRules.volumeRootFromAppDir`, null entries dropped; label `null` for primary, `StorageManager.getStorageVolume(file)?.getDescription(context)` for others), `SafWalker.kt` (`DocumentsContract.buildChildDocumentsUriUsingTree` queries for `COLUMN_DOCUMENT_ID, COLUMN_DISPLAY_NAME, COLUMN_MIME_TYPE, COLUMN_SIZE, COLUMN_LAST_MODIFIED`; same skip rules; PDFs = mime `application/pdf` or `.pdf` name; document URIs via `buildDocumentUriUsingTree`; `SecurityException` → root failed), `Errors.kt` (one `CodedException` subclass per code), and in `PdfNativeModule.kt` the four functions + `Events("onScanProgress")`.
- [ ] **Step 7: Write the failing JS test** `pdfNative.test.ts`: with `jest.setup.js` mocking `./modules/pdf-native` (Step 8), `pdfNative.scanPdfs(['file:///x'])` forwards args and returns the mocked result; `isPdfNativeError(nativeError('ERR_PDF_ENCRYPTED'), 'ERR_PDF_ENCRYPTED')` true, with `'ERR_PDF_INVALID'` false, `isPdfNativeError(new Error('x'))` false.
- [ ] **Step 8:** Implement the wrapper and `fakePdfNative.ts`; in `jest.setup.js` add `jest.mock('./modules/pdf-native', () => ({ __esModule: true, default: require('./src/test-utils/fakePdfNative').createFakeNativeModule() }))` (export `createFakeNativeModule()` = fake API minus `addScanProgressListener`, plus `addListener` returning `{ remove: jest.fn() }`). Run `npm test -- pdfNative` → PASS.
- [ ] **Step 9:** `cd android && ./gradlew :app:compileDebugKotlin` → BUILD SUCCESSFUL. Run typecheck, lint, test, format:check → pass.
- [ ] **Step 10:** Commit `feat(pdf-native): local Expo module with PDF scan, skip rules and access checks`.

### Task 3: pdf-native module — thumbnails, page count, file operations, folder picker

**Files:**
- Create: `modules/pdf-native/android/src/main/java/com/pdfkagaz/pdfnative/FileNames.kt`, `ThumbKey.kt`, `Thumbnails.kt`, `FileOps.kt`, `FolderPickerContract.kt`
- Modify: `PdfNativeModule.kt`, `modules/pdf-native/src/PdfNative.types.ts`, `modules/pdf-native/src/PdfNativeModule.ts`, `src/services/native/pdfNative.ts`, `src/test-utils/fakePdfNative.ts`
- Test: `.../src/test/java/com/pdfkagaz/pdfnative/FileNamesTest.kt`, `ThumbKeyTest.kt`

**Interfaces:**
- Consumes: Task 2 types, `Errors.kt`, `PdfWalker`, `ScanRules`.
- Produces (native, added to `PdfNativeApi`):
  - `generateThumbnail(uri: string, page: number, width: number): Promise<string>` — 1-based page; returns a `file://` JPEG (quality 80) in `cacheDir/thumbs/<ThumbKey>.jpg`; reuses it if present; bitmap filled white before `page.render(…, RENDER_MODE_FOR_DISPLAY)`; height = width × page aspect, capped at 2 × width. All PdfRenderer use goes through one `kotlinx.coroutines.sync.Mutex`.
  - `getPageCount(uri: string, password?: string | null): Promise<number>` — password given → `ERR_PASSWORD_UNSUPPORTED`.
  - Both map: missing file → `ERR_FILE_NOT_FOUND`; `SecurityException` from `PdfRenderer` → `ERR_PDF_ENCRYPTED`; `IOException`/`IllegalArgumentException` from `PdfRenderer` → `ERR_PDF_INVALID`; `SecurityException` from `ContentResolver` → `ERR_PERMISSION_DENIED`.
  - `renameFile(uri: string, newName: string): Promise<PdfFileInfo>` (file: `File.renameTo` in the same folder, target exists → `ERR_FILE_EXISTS`; SAF: `DocumentsContract.renameDocument`; name containing `/` or `\u0000` → `ERR_INVALID_NAME`)
  - `deleteFile(uri: string): Promise<void>` (already gone → resolves)
  - `duplicateFile(uri: string, parentUri: string): Promise<PdfFileInfo>` (same folder, `FileNames.duplicateName`; temp-then-rename; SAF: `DocumentsContract.createDocument` in `parentUri` then stream copy)
  - `moveToAppFolder(uri: string): Promise<PdfFileInfo>` (target `Environment.getExternalStoragePublicDirectory(DIRECTORY_DOCUMENTS)/PDFToolkit`; if `hasAllFilesAccess` → java.io copy to `.<name>.part`, rename to `FileNames.uniqueName`, delete source (try `renameTo` first on same volume); else (API ≥ 29 without full access) insert into `MediaStore.Files.getContentUri("external")` with `RELATIVE_PATH = "Documents/PDFToolkit/"`, `IS_PENDING` 1→0, copy, delete source; returned `uri` is then the MediaStore content URI)
  - `pickFolder(): Promise<PickedFolder | null>` (`ACTION_OPEN_DOCUMENT_TREE` via `RegisterActivityContracts` + an `AppContextActivityResultContract` whose input class is `Serializable`; takes persistable READ|WRITE grant; label = display name of the tree root document; cancel → null) — model it on `expo-file-system`'s `FilePickerContract.kt` (node_modules/expo-file-system/android/…/FilePickerContract.kt, v57.0.7).
  - `releaseFolder(uri: string): Promise<void>` (`releasePersistableUriPermission`, `SecurityException` ignored)
  - `getPersistedFolderUris(): Promise<string[]>` (`contentResolver.persistedUriPermissions` with read permission)
- Produces (Kotlin, pure): `object FileNames { fun duplicateName(name: String, exists: (String) -> Boolean): String; fun uniqueName(name: String, exists: (String) -> Boolean): String }`; `object ThumbKey { fun of(uri: String, sizeBytes: Long, modifiedAt: Long, page: Int, width: Int): String }` (SHA-1 hex, 40 chars).

- [ ] **Step 1: Write failing JUnit tests.** `FileNamesTest`:
  - `duplicateName("a.pdf") { false }` == `"a (copy).pdf"`; with `"a (copy).pdf"` taken → `"a (copy 2).pdf"`; `duplicateName("अहवाल.pdf") { false }` == `"अहवाल (copy).pdf"`; `duplicateName("noext") { false }` == `"noext (copy)"`
  - `uniqueName("a.pdf") { false }` == `"a.pdf"`; with `"a.pdf"` taken → `"a (2).pdf"`; with `a.pdf` and `a (2).pdf` taken → `"a (3).pdf"`
  `ThumbKeyTest`: same inputs → same 40-char lowercase hex; changing any of size, modifiedAt, page or width changes the key; Devanagari uri works.
- [ ] **Step 2:** Run `./gradlew :pdf-native:testDebugUnitTest` → FAIL.
- [ ] **Step 3:** Implement `FileNames.kt`, `ThumbKey.kt` → Gradle tests PASS.
- [ ] **Step 4:** Implement `Thumbnails.kt`, `FileOps.kt`, `FolderPickerContract.kt` and register the nine functions in `PdfNativeModule.kt`; extend the TS module declaration, `PdfNativeApi`, `pdfNative`, and the fake (defaults: `generateThumbnail` → `'file:///thumb.jpg'`, `getPageCount` → 1, ops return a `PdfFileInfo` derived from the input uri).
- [ ] **Step 5:** `cd android && ./gradlew :app:compileDebugKotlin :pdf-native:testDebugUnitTest` → BUILD SUCCESSFUL. typecheck, lint, test, format:check → pass.
- [ ] **Step 6:** Commit `feat(pdf-native): thumbnails, page count, file operations and SAF folder picker`.

### Task 4: Storage permissions config plugin and `play-saf` variant

**Files:**
- Create: `plugins/withStoragePermissions.js`, `app.config.ts`, `src/config/appVariant.ts`
- Modify: `eas.json`, `eslint.config.js` (Node globals for `plugins/*.js` if needed)
- Test: `plugins/__tests__/withStoragePermissions.test.ts`, `src/config/__tests__/appVariant.test.ts`

**Interfaces:**
- Produces:
  - `plugins/withStoragePermissions.js` (CommonJS): default export `ConfigPlugin<{ allFilesAccess: boolean }>` built with `withAndroidManifest` from `expo/config-plugins`; named export `applyStoragePermissions(manifest: AndroidManifest, opts: { allFilesAccess: boolean }): AndroidManifest`. It ensures `READ_EXTERNAL_STORAGE` (`android:maxSdkVersion="32"`) and `WRITE_EXTERNAL_STORAGE` (`android:maxSdkVersion="29"`), each with `tools:replace="android:maxSdkVersion"`; sets `android:requestLegacyExternalStorage="true"` on `<application>`; when `allFilesAccess` adds `MANAGE_EXTERNAL_STORAGE` with `tools:ignore="ScopedStorage"`; when not, adds nothing (the blocked list removes it). Calls `AndroidConfig.Manifest.ensureToolsAvailable`.
  - `app.config.ts`: `export default ({ config }: ConfigContext): ExpoConfig` — `const variant = process.env.APP_VARIANT === 'play-saf' ? 'play-saf' : 'default'`; appends `['./plugins/withStoragePermissions', { allFilesAccess: variant === 'default' }]`; for `play-saf` appends `'android.permission.MANAGE_EXTERNAL_STORAGE'` to `android.blockedPermissions`; `extra: { ...config.extra, appVariant: variant, allFilesAccessEnabled: variant === 'default' }`. Package ID unchanged (`com.pdfkagaz.pdftoolkit`).
  - `src/config/appVariant.ts`: `export function allFilesAccessEnabled(): boolean` — `Constants.expoConfig?.extra?.allFilesAccessEnabled !== false`.
  - `eas.json`: new profile `"production-saf": { "extends": "production", "env": { "APP_VARIANT": "play-saf" } }`; `development` gets nothing (default variant). For a local play-saf dev run: `APP_VARIANT=play-saf npx expo prebuild --platform android --clean` and start Metro with the same env.

- [ ] **Step 1: Write failing tests.** `withStoragePermissions.test.ts` (build a minimal manifest `{ manifest: { $: { 'xmlns:android': '…' }, application: [{ $: { 'android:name': '.MainApplication' } }] } }`):
  - `allFilesAccess: true` → `uses-permission` names include READ (maxSdk `32`), WRITE (maxSdk `29`) and MANAGE (`tools:ignore` `ScopedStorage`); application has `android:requestLegacyExternalStorage === 'true'`; `xmlns:tools` present
  - `allFilesAccess: false` → no MANAGE entry; READ/WRITE and legacy flag still present
  - applying twice → no duplicate permission entries
  - `require('../../app.config').default({ config: <app.json expo object> })` with `APP_VARIANT=play-saf` → `android.blockedPermissions` contains MANAGE and `extra.allFilesAccessEnabled === false`; without the env → `true` and MANAGE not blocked
  `appVariant.test.ts`: mock `expo-constants` → extra `{ allFilesAccessEnabled: false }` → `false`; extra missing → `true`.
- [ ] **Step 2:** Run `npm test -- withStoragePermissions appVariant` → FAIL.
- [ ] **Step 3:** Implement the four files; `eas.json` profile.
- [ ] **Step 4:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** `npx expo prebuild --platform android --clean` → `android/app/src/main/AndroidManifest.xml` has MANAGE_EXTERNAL_STORAGE, WRITE maxSdk 29, `requestLegacyExternalStorage="true"`. Then `APP_VARIANT=play-saf npx expo prebuild --platform android --clean` → MANAGE present only with `tools:node="remove"`. Finish with a default-variant prebuild again. `npx expo config --type public | grep allFilesAccessEnabled` → `true`.
- [ ] **Step 6:** Commit `feat: storage permission config plugin and play-saf variant`.

### Task 5: File index repository

**Files:**
- Modify: `src/db/schema.ts`; generate `src/db/migrations/0001_*.sql` + updated `migrations.js`/meta via `npm run db:generate`
- Create: `src/utils/fileId.ts`, `src/services/index/fileIndexRepo.ts`
- Test: `src/utils/__tests__/fileId.test.ts`, `src/services/index/__tests__/fileIndexRepo.test.ts`

**Interfaces:**
- Consumes: `PdfFileInfo`, `ScanResult`, `FolderChange`, `FolderStamp` (Task 2, import type from `@/services/native/pdfNative`); tables from `src/db/schema.ts`.
- Produces:
  - Schema: `files.parentUri: text('parent_uri')` (nullable) + index `files_parent_uri_idx`; new table `folderStamps = sqliteTable('folder_stamps', { uri: text().primaryKey(), modifiedAt: integer('modified_at').notNull() })`; types `FolderStampRow`.
  - `fileIdForUri(uri: string): string` — FNV-1a 64-bit over the UTF-8 bytes (hand-rolled UTF-8 encoding, not `TextEncoder`), `BigInt` math, 16 lowercase hex chars. Never change this algorithm (IDs are persisted).
  - `type IndexDb = BaseSQLiteDatabase<'sync', unknown>` (from `drizzle-orm/sqlite-core`; must accept both `ExpoSQLiteDatabase` and `BetterSQLite3Database` — if TS rejects `unknown`, use `any` with an eslint-disable comment).
  - `type ScanDiff = { added: number; updated: number; removed: number }`
  - `isUnderRoot(uri: string, root: string): boolean` (prefix match on `root + '/'`, so `…/0/Download` is not under `…/0/Down`)
  - `listFiles(db): FileRow[]`
  - `applyScan(db, input: { result: ScanResult; source: 'scan' | 'saf' }): ScanDiff` — one transaction; upserts every file (id = `fileIdForUri(uri)`, `onConflictDoUpdate` on `id` updating only `name, folder, parentUri, sizeBytes, modifiedAt` — and resetting `thumbPath`, `pageCount` to null and `isEncrypted` to false when `sizeBytes` or `modifiedAt` changed; `isFavorite`, `lastPage`, `lastOpenedAt` never touched); deletes rows with that `source` that are under one of `result.scannedRoots` and not in `result.files`; rows under `failedRoots` or under no scanned root are kept; for `source === 'scan'` replaces all `folder_stamps` with the distinct `(parentUri, parentModifiedAt)` of the result. Inserts chunked at 50 rows.
  - `applyFolderChanges(db, changes: FolderChange[]): ScanDiff` — per change: `exists:false` → delete `source='scan'` rows with that `parentUri` and its stamp; else upsert files as `scan`, delete `scan` rows with that `parentUri` not in `files`, upsert stamp.
  - `upsertFile(db, info: PdfFileInfo, source: FileRow['source']): FileRow`
  - `replaceFile(db, oldId: string, info: PdfFileInfo, source: FileRow['source']): FileRow` — transaction: insert new row copying `isFavorite`, `lastPage`, `lastOpenedAt`, `thumbPath`, `pageCount`, `isEncrypted` from the old row; `UPDATE bookmarks SET file_id = new WHERE file_id = old`; delete old row (order matters: cascade would delete bookmarks).
  - `removeFile(db, id: string): void`; `deleteBySource(db, source: FileRow['source']): number`
  - `setFavorite(db, id: string, value: boolean): void`; `markOpened(db, id: string, at: number): void`
  - `updateThumb(db, id: string, patch: { thumbPath?: string | null; pageCount?: number | null; isEncrypted?: boolean }): void`
  - `getFolderStamps(db): FolderStamp[]`
  - `listScanRoots(db): ScanRootRow[]`; `addScanRoot(db, root: { uri: string; label: string; addedAt: number }): void` (ignore duplicate); `removeScanRoot(db, uri: string): number` (deletes the root and every `source='saf'` file under it; returns files removed)

- [ ] **Step 1:** Edit `schema.ts`, run `npm run db:generate` → one new migration; existing `schema.test.ts` still passes.
- [ ] **Step 2: Write failing tests.** `fileId.test.ts`: `fileIdForUri('')` == `'cbf29ce484222325'`; `fileIdForUri('a')` == `'af63dc4c8601ec8c'`; Marathi uri → 16 hex chars, stable across calls, differs from the NFD form's id.
  `fileIndexRepo.test.ts` (`@jest-environment node`, better-sqlite3 in-memory, same `makeDb()` as `src/db/__tests__/schema.test.ts`; helper `info(path, overrides)` building a `PdfFileInfo` under root `file:///storage/emulated/0`):
  - first `applyScan` with 3 files → `{ added: 3, updated: 0, removed: 0 }`, rows have `source 'scan'`, `parentUri` set
  - favourite a row, rescan with that file's `modifiedAt` changed → `isFavorite` still true, `thumbPath`/`pageCount` reset to null; rescan unchanged → thumb fields untouched
  - rescan without one file → `removed: 1`
  - Review Focus 1: rows under `file:///storage/1A2B-3C4D` stay when the next result's `scannedRoots` is only the primary root; rows under a `failedRoots` entry stay
  - rows with `source 'output'` survive a `scan` rescan that doesn't contain them
  - `isUnderRoot('file:///s/0/Download/a.pdf', 'file:///s/0/Down')` false; `…/Download` true
  - `applyFolderChanges`: changed folder with one new + one missing file → added 1 / removed 1; `exists:false` → its rows and stamp gone; stamps readable via `getFolderStamps`
  - `replaceFile` keeps favourite + bookmarks (insert 2 bookmarks on old id → 2 on new id, 0 on old)
  - `removeScanRoot` deletes only `saf` rows under that tree uri
  - Review Focus 3: `applyScan` of 1,000 files < 1,000 ms; second identical scan < 1,000 ms
- [ ] **Step 3:** Run `npm test -- fileId fileIndexRepo` → FAIL.
- [ ] **Step 4:** Implement `fileId.ts` and `fileIndexRepo.ts` with drizzle query builders (`.run()/.all()/.get()`, `db.transaction((tx) => …)`).
- [ ] **Step 5:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 6:** Commit `feat: file index repository with scan diffing and folder stamps`.

### Task 6: Storage providers and storage store

**Files:**
- Create: `src/services/storage/StorageProvider.ts`, `src/services/storage/FullAccessProvider.ts`, `src/services/storage/SafProvider.ts`, `src/services/storage/resolveStorageMode.ts`, `src/services/storage/waitForForeground.ts`, `src/stores/storageStore.ts`
- Test: `src/services/storage/__tests__/FullAccessProvider.test.ts`, `SafProvider.test.ts`, `resolveStorageMode.test.ts`, `src/stores/__tests__/storageStore.test.ts`

**Interfaces:**
- Consumes: `PdfNativeApi`, `pdfNative`, types (Tasks 2–3); repo functions `listScanRoots`, `addScanRoot`, `removeScanRoot`, `IndexDb` (Task 5); `allFilesAccessEnabled()` (Task 4); `getDb()` (`src/db/client.ts`).
- Produces:
  - `type StorageMode = 'full' | 'saf'`; `type FileRef = { uri: string; parentUri: string | null }`; `type ScanRootView = { uri: string; label: string; granted: boolean }`; `type QuickScanOutcome = { kind: 'folders'; changes: FolderChange[] } | { kind: 'full'; result: ScanResult }`
  - `interface StorageProvider { readonly mode: StorageMode; readonly source: 'scan' | 'saf'; hasAccess(): Promise<boolean>; requestAccess(): Promise<boolean>; fullScan(onProgress?: (e: ScanProgressEvent) => void): Promise<ScanResult>; quickScan(stamps: FolderStamp[]): Promise<QuickScanOutcome>; rename(file: FileRef, newName: string): Promise<PdfFileInfo>; remove(file: FileRef): Promise<void>; duplicate(file: FileRef): Promise<PdfFileInfo>; moveToAppFolder(file: FileRef): Promise<PdfFileInfo>; listRoots(): Promise<ScanRootView[]>; addRoot(): Promise<ScanRootView | null>; removeRoot(uri: string): Promise<void> }`
  - `createFullAccessProvider(deps: { native: PdfNativeApi; apiLevel: number; permissions: Pick<typeof PermissionsAndroid, 'requestMultiple' | 'PERMISSIONS' | 'RESULTS'>; waitForForeground: () => Promise<void> }): StorageProvider` — `requestAccess`: API ≥ 30 → `openAllFilesAccessSettings()`, `await waitForForeground()`, return `hasAllFilesAccess()`; API < 30 → `requestMultiple([READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE])`, true iff READ is `granted`. `fullScan` = `scanPdfs(null)`; `quickScan` → `{ kind: 'folders', changes: await scanChangedFolders(stamps) }`; `listRoots` → `[]`; `addRoot` → `null`; `removeRoot` no-op. `fullScan` subscribes `onProgress` via `addScanProgressListener` and always removes it (also on reject).
  - `createSafProvider(deps: { native: PdfNativeApi; getDb: () => IndexDb; now: () => number }): StorageProvider` — `listRoots` = `scan_roots` rows marked `granted` iff in `getPersistedFolderUris()`; `hasAccess` = any granted root; `requestAccess` = `addRoot() !== null`; `addRoot` = `pickFolder()` → `addScanRoot` → view; `removeRoot` = `releaseFolder` + `removeScanRoot`; `fullScan` = `scanPdfs(grantedRootUris)` with ungranted roots appended to `failedRoots` (and an empty granted list returns an empty result without calling native); `quickScan` → `{ kind: 'full', result: await fullScan() }`.
  - `waitForForeground(appState = AppState): Promise<void>` — resolves on the next `'active'` change after a `'background'`/`'inactive'`, or after 120 s.
  - `resolveStorageMode(deps: { hasAllFilesAccess: () => Promise<boolean>; grantedRootCount: () => Promise<number> }): Promise<StorageMode | 'none'>` — full access wins, then SAF with ≥ 1 granted root, else `'none'`.
  - `createStorageStore(deps: { full: StorageProvider; saf: StorageProvider; apiLevel: number; allFilesAccessEnabled: boolean })` → Zustand store, state `{ mode: StorageMode | 'none' | 'unknown'; roots: ScanRootView[]; canRequestFullAccess: boolean }` (`canRequestFullAccess = apiLevel < 30 || allFilesAccessEnabled`), actions `refreshMode(): Promise<StorageMode | 'none'>` (also reloads `roots` from the SAF provider), `requestFullAccess(): Promise<boolean>`, `addFolder(): Promise<boolean>`, `removeFolder(uri: string): Promise<void>`, `provider(): StorageProvider | null` (by current mode). Every action ends with `refreshMode()`.
  - `useStorage` = `createStorageStore({ full: createFullAccessProvider({ native: pdfNative, apiLevel: Platform.Version as number, permissions: PermissionsAndroid, waitForForeground }), saf: createSafProvider({ native: pdfNative, getDb, now: Date.now }), apiLevel: Platform.Version as number, allFilesAccessEnabled: allFilesAccessEnabled() })`.

- [ ] **Step 1: Write failing tests** (all with `createFakePdfNative()` from `src/test-utils/fakePdfNative.ts`; SAF tests use a better-sqlite3 `IndexDb` as in Task 5):
  - Full, API 33: `requestAccess()` calls `openAllFilesAccessSettings` then awaits `waitForForeground`, returns the second `hasAllFilesAccess` value (`true`); returns `false` when still denied — never throws (F-01)
  - Full, API 29: uses `requestMultiple`; READ `denied` → `false`; `openAllFilesAccessSettings` not called
  - Full: `fullScan(cb)` passes `null` roots, forwards progress events to `cb`, listener removed after a rejected scan
  - SAF: `addRoot()` with `pickFolder` → `{ uri: 'content://t/tree/primary%3ADocuments', label: 'Documents' }` stores a `scan_roots` row; `pickFolder` → null returns null and stores nothing
  - SAF, Review Focus 1: two roots, `getPersistedFolderUris` returns only one → `scanPdfs` called with that one, the other in `failedRoots`, `listRoots()` shows it `granted: false`
  - SAF: `removeRoot` calls `releaseFolder` and removes saf rows under it
  - `resolveStorageMode`: full true → `'full'`; full false + 1 granted root → `'saf'`; neither → `'none'`; `hasAllFilesAccess` rejecting → treated as false
  - store: `canRequestFullAccess` false for `apiLevel 33, allFilesAccessEnabled false`, true for `apiLevel 29, false`; `refreshMode` sets `mode` and `roots`; `provider()` returns `null` for `'none'`
- [ ] **Step 2:** Run `npm test -- storage` → FAIL.
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat: StorageProvider with full-access and SAF implementations`.

### Task 7: File query, name validation, sort prefs, thumbnail queue

**Files:**
- Create: `src/services/files/fileQuery.ts`, `src/utils/fileName.ts`, `src/utils/date.ts`, `src/services/thumbnails/thumbnailQueue.ts`
- Modify: `src/stores/settingsStore.ts`
- Test: `src/services/files/__tests__/fileQuery.test.ts`, `src/utils/__tests__/fileName.test.ts`, `src/utils/__tests__/date.test.ts`, `src/services/thumbnails/__tests__/thumbnailQueue.test.ts`, `src/stores/__tests__/settingsStore.test.ts` (extend)

**Interfaces:**
- Consumes: `FileRow` (schema), `PdfNativeApi`, `isPdfNativeError` (Task 2).
- Produces:
  - `type FileSegment = 'all' | 'recent' | 'favorites' | 'folders'`; `type SortKey = 'name' | 'date' | 'size'`; `type SortDir = 'asc' | 'desc'`
  - `normalizeForSearch(s: string): string` (`normalize('NFC').toLocaleLowerCase()`)
  - `queryFiles(files: readonly FileRow[], q: { segment: Exclude<FileSegment, 'folders'>; sortKey: SortKey; sortDir: SortDir; search: string; parentUri?: string | null }): FileRow[]` — `recent` = `recentFiles(files, 50)` (sort ignored); `favorites` = `isFavorite`; `parentUri` filters to one folder; search = substring of normalized name; name sort with one module-level `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`; ties broken by `id`.
  - `recentFiles(files: readonly FileRow[], limit: number): FileRow[]` — rows with `lastOpenedAt` (desc) first, then padded with the newest by `modifiedAt`.
  - `type FolderGroup = { parentUri: string; folder: string; count: number; latestModifiedAt: number }`; `groupByFolder(files: readonly FileRow[], search: string): FolderGroup[]` (sorted by `folder` with the collator; search matches folder name).
  - `validatePdfFileName(input: string): { ok: true; name: string } | { ok: false; reason: 'empty' | 'invalidChars' | 'tooLong' }` — trims; appends `.pdf` unless it already ends with `.pdf` (any case); rejects `/ \ : * ? " < > |` and control chars; > 255 UTF-8 bytes → `tooLong`.
  - `formatDate(ms: number, locale: string): string` (`Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })`)
  - settings store: state `filesSortKey: SortKey` (default `'date'`), `filesSortDir: SortDir` (default `'desc'`), action `setFilesSort(key: SortKey, dir: SortDir)`; KV keys `filesSortKey`, `filesSortDir`; invalid stored values → defaults.
  - `type ThumbResult = { id: string; thumbPath: string | null; pageCount: number | null; isEncrypted: boolean; missing: boolean }`
  - `createThumbnailQueue(deps: { native: Pick<PdfNativeApi, 'generateThumbnail' | 'getPageCount'>; width: number; concurrency?: number; onResult: (r: ThumbResult) => void }): { request(file: Pick<FileRow, 'id' | 'uri'>): void; clear(): void }` — default concurrency 2; LIFO (latest request first, i.e. the rows just rendered); ignores ids already queued, running, done or failed this session; per file calls `getPageCount(uri)` then `generateThumbnail(uri, 1, width)`; `ERR_PDF_ENCRYPTED` → `{ isEncrypted: true, thumbPath: null }`; `ERR_PDF_INVALID` → result with nulls, never retried; `ERR_FILE_NOT_FOUND` → `missing: true`; other errors → no result, not retried this session.

- [ ] **Step 1: Write failing tests.**
  - `fileQuery`: fixture of 6 rows incl. `अहवाल.pdf`, `Report 10.pdf`, `Report 9.pdf`; name asc → `Report 9` before `Report 10`; size desc; date desc; `favorites` only favourites; `recent` puts the two opened rows first (newest open first), then pads by `modifiedAt`; search `'report'` matches both reports case-insensitively; Review Focus 4: search with `'अहवाल'.normalize('NFD')` matches the NFC name; `parentUri` filter; `groupByFolder` counts per folder.
  - Review Focus 3: 1,000 generated rows, `queryFiles` with search `'7'` + name sort < 100 ms (measure with `performance.now()` after one warm-up call).
  - `fileName`: `' Notes '` → `'Notes.pdf'`; `'a.PDF'` → `'a.PDF'`; `'अहवाल २'` → `'अहवाल २.pdf'`; `''`/`'   '` → `empty`; `'a/b'` → `invalidChars`; 300 × `'अ'` → `tooLong`.
  - `date`: `formatDate(Date.UTC(2026, 9, 20, 12), 'en-GB')` contains `'20'`, `'Oct'`, `'2026'`.
  - `settingsStore`: defaults `date`/`desc`; `setFilesSort('name','asc')` persists; stored `'blue'` → `'date'`.
  - `thumbnailQueue` (Review Focus 5): encrypted → `onResult` with `isEncrypted: true` and `generateThumbnail` not called; invalid → requested twice → native called once; not-found → `missing: true`; duplicate `request` of a queued id runs once; with concurrency 2 and 5 requests at most 2 in flight; last requested runs first after the in-flight ones; `clear()` drops pending.
- [ ] **Step 2:** Run `npm test -- fileQuery fileName date thumbnailQueue settingsStore` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat: file search/sort/grouping, name validation and thumbnail queue`.

### Task 8: Files store and index lifecycle

**Files:**
- Create: `src/stores/filesStore.ts`, `src/services/files/useFileIndexLifecycle.ts`
- Test: `src/stores/__tests__/filesStore.test.ts`, `src/services/files/__tests__/useFileIndexLifecycle.test.tsx`

**Interfaces:**
- Consumes: repo functions + `IndexDb` (Task 5); `StorageProvider`, `useStorage` (Task 6); `createThumbnailQueue`, `ThumbResult` (Task 7); `pdfNative`, `isPdfNativeError` (Task 2); `getDb` (`src/db/client.ts`).
- Produces:
  - `type FilesStatus = 'idle' | 'loading' | 'scanning'`; `type FileActionError = 'notFound' | 'exists' | 'invalidName' | 'permission' | 'unknown'`
  - `createFilesStore(deps: { getDb: () => IndexDb; getProvider: () => StorageProvider | null; native: Pick<PdfNativeApi, 'generateThumbnail' | 'getPageCount'>; thumbWidth: number; now: () => number })` → Zustand store:
    - state `{ files: FileRow[]; status: FilesStatus; progress: ScanProgressEvent | null; lastScanAt: number | null; notice: FileActionError | null }`
    - `loadFromCache(): void` (sync `listFiles`; F-03 instant list)
    - `refresh(kind: 'full' | 'quick'): Promise<void>` — single-flight (a call while scanning returns the running promise); provider null → no-op; `full`: `deleteBySource(db, other source)` (`'saf'` ↔ `'scan'`), `provider.fullScan(onProgress)` → `applyScan`; `quick`: `provider.quickScan(getFolderStamps(db))` → `applyFolderChanges` or `applyScan`; then reload `files`, set `lastScanAt`; on reject keeps the old list and sets `status 'idle'`. In `__DEV__` logs `[scan] <kind> <ms>ms <count> files` (no names).
    - `toggleFavorite(id: string): void`, `markOpened(id: string): void`
    - `rename(id: string, newName: string): Promise<FileActionError | null>`, `remove(id: string): Promise<FileActionError | null>`, `duplicate(id: string): Promise<FileActionError | null>`, `moveToAppFolder(id: string): Promise<FileActionError | null>` — call the provider with `{ uri, parentUri }`; on success update the DB (`replaceFile` for rename/move, `upsertFile` for duplicate with the provider's `source` — but `'output'` for a SAF-mode move — `removeFile` for delete) and reload `files` before resolving (F-07 "list updates immediately"); error mapping `ERR_FILE_NOT_FOUND` → `'notFound'` (and the row is removed), `ERR_FILE_EXISTS` → `'exists'`, `ERR_INVALID_NAME` → `'invalidName'`, `ERR_PERMISSION_DENIED` → `'permission'`, else `'unknown'`
    - `requestThumb(file: FileRow): void` — skips rows with `thumbPath` set or `isEncrypted`; results → `updateThumb` (or `removeFile` + `notice: 'notFound'` when `missing`) and an in-place update of that row in `files`
    - `clearNotice(): void`
  - `useFiles` = `createFilesStore({ getDb, getProvider: () => useStorage.getState().provider(), native: pdfNative, thumbWidth: Math.min(200, Math.round(48 * PixelRatio.get())), now: Date.now })`
  - `useFileIndexLifecycle(): void` — on mount: `await useStorage.getState().refreshMode()`, `useFiles.getState().loadFromCache()`, then if mode ≠ `'none'` → `refresh('full')`. On `AppState` → `'active'`: `refreshMode()`; if mode changed and ≠ `'none'` → `refresh('full')`; else if mode ≠ `'none'` and `now - lastScanAt ≥ 10_000` → `refresh('quick')`. Removes the AppState listener on unmount.

- [ ] **Step 1: Write failing tests** (better-sqlite3 `IndexDb`, fake provider object implementing `StorageProvider` with `jest.fn`s, fake native from `createFakePdfNative()`):
  - cache first: seed 2 rows, `loadFromCache()` → `files.length === 2` synchronously, before any provider call
  - `refresh('full')` sets `status 'scanning'` and `progress` from the provider callback, then `idle` with the scanned files; two concurrent calls → `fullScan` called once
  - full scan rejecting (e.g. `nativeError('ERR_PERMISSION_DENIED')`) → old list kept, `status 'idle'`
  - `refresh('quick')` with `{ kind: 'folders', changes: [<new WhatsApp file>] }` → new row appears (F-04)
  - mode switch: seeded `saf` rows are dropped by a full-access `refresh('full')`; `output` rows kept
  - `remove(id)` → provider `remove` called with `{ uri, parentUri }`, row gone from `files` when the promise resolves
  - `rename` keeps `isFavorite`; provider rejecting `ERR_FILE_EXISTS` → returns `'exists'`, row unchanged
  - Review Focus 2: `duplicate` rejecting `ERR_FILE_NOT_FOUND` → returns `'notFound'`, row removed; `requestThumb` with native `generateThumbnail` rejecting `ERR_FILE_NOT_FOUND` → row removed, `notice === 'notFound'`
  - `requestThumb` success → row's `thumbPath` and `pageCount` updated in state and DB
  - lifecycle hook (mock `useStorage`/`useFiles` state, `AppState` via `jest.spyOn(AppState, 'addEventListener')`): mount with mode `'full'` → `loadFromCache` then `refresh('full')`; mode `'none'` → no refresh; `'active'` 11 s after the last scan → `refresh('quick')`; after 3 s → nothing; mode change `'none'` → `'saf'` → `refresh('full')`
- [ ] **Step 2:** Run `npm test -- filesStore useFileIndexLifecycle` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat: files store with cache-first load, background and foreground rescans`.

### Task 9: Onboarding, PermissionGate, scanned-folders settings

**Files:**
- Modify: `app/onboarding.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx` (mount `useFileIndexLifecycle()`), `app/(tabs)/settings.tsx`, `src/i18n/en.json`, `src/__tests__/navigation/tabs.test.tsx` (set `onboardingDone: true` in `beforeEach`)
- Create: `src/components/PermissionGate.tsx`, `src/components/StorageAccessCard.tsx`, `src/components/ScannedFoldersSection.tsx`
- Test: `src/__tests__/navigation/onboarding.test.tsx`, `src/components/__tests__/PermissionGate.test.tsx`, `src/components/__tests__/ScannedFoldersSection.test.tsx`

**Interfaces:**
- Consumes: `useSettings` (`onboardingDone`, `setOnboardingDone`), `useStorage` (Task 6), `useFiles` (Task 8), `useFileIndexLifecycle` (Task 8), `EmptyState`, `useTheme`.
- Produces:
  - `StorageAccessCard({ onDone?: (granted: boolean) => void })` — explainer text + "Allow access to all files" button (only when `canRequestFullAccess`) + "Pick folders instead" button; calls `requestFullAccess()` / `addFolder()`, then `onDone(result)`; any outcome, including denial, leaves the app usable (F-01).
  - `PermissionGate({ children })` — `mode 'unknown'` → spinner; `'none'` → `StorageAccessCard`; else children.
  - `ScannedFoldersSection()` — rendered by Settings only when `mode === 'saf'` (or `'none'` with roots): list of roots (label, "Access lost — add it again" when `!granted`), Remove button per root (`accessibilityLabel` = `t('settings.removeFolder', { label })`), "Add folder" button; after add/remove calls `useFiles.getState().refresh('full')` (removal already drops rows; call `loadFromCache()`).
  - Settings tab also shows a "Storage access" row: mode text, and "Allow access to all files" when mode ≠ `'full'` and `canRequestFullAccess`.
  - `app/index.tsx`: `onboardingDone ? <Redirect href="/home" /> : <Redirect href="/onboarding" />`.
  - `app/onboarding.tsx`: 3 slides (A-02), a dot indicator, Next/Skip; slide 3 = `StorageAccessCard` + "Not now"; any of grant / pick / not now → `setOnboardingDone(true)` and `router.replace('/home')`.
  - en.json additions (exact copy):
    - `onboarding.slide1Title` "All your PDFs in one place", `onboarding.slide1Body` "We find every PDF on your phone so you never have to dig through folders."
    - `onboarding.slide2Title` "Works offline, stays private", `onboarding.slide2Body` "Your files never leave your phone unless you share them."
    - `onboarding.slide3Title` "Find your PDFs", `onboarding.next` "Next", `onboarding.skip` "Skip", `onboarding.notNow` "Not now"
    - `storage.explainer` "To find all your PDFs, PDF Toolkit needs access to your files. Nothing is uploaded."
    - `storage.grantAll` "Allow access to all files", `storage.pickFolders` "Pick folders instead", `storage.pickHint` "Choose folders like Documents or WhatsApp Documents. Android doesn't allow picking the whole Download folder."
    - `storage.modeFull` "All files", `storage.modeSaf` "Selected folders", `storage.modeNone` "No access", `storage.title` "Storage access"
    - `settings.scannedFolders` "Scanned folders", `settings.addFolder` "Add folder", `settings.removeFolder` "Remove {{label}}", `settings.accessLost` "Access lost — add it again", `settings.noFolders` "No folders added yet"

- [ ] **Step 1: Write failing tests.**
  - `onboarding.test.tsx` (`renderRouter` on real `app/`, `useDatabaseReady` mocked as in `tabs.test.tsx`, `useStorage.setState` with jest.fn actions): `onboardingDone false` → lands on "All your PDFs in one place"; Next ×2 → "Allow access to all files" and "Pick folders instead" visible; pressing "Not now" → `onboardingDone === true` and Home tab visible; with `canRequestFullAccess: false` the grant button is absent; `requestFullAccess` resolving `false` → still navigates to Home (F-01: denial never blocks)
  - `onboardingDone true` → `/` lands on Home (existing tabs test, updated)
  - `PermissionGate.test.tsx`: mode `'none'` → explainer shown, children hidden; mode `'saf'` → children
  - `ScannedFoldersSection.test.tsx`: two roots, one `granted: false` → "Access lost — add it again" once; pressing "Remove Documents" calls `removeFolder('content://…Documents')`; "Add folder" calls `addFolder`
- [ ] **Step 2:** Run `npm test -- onboarding PermissionGate ScannedFoldersSection tabs` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat: onboarding, permission gate and scanned-folder settings`.

### Task 10: Files tab and Home tab

**Files:**
- Modify: `app/(tabs)/files.tsx`, `app/(tabs)/home.tsx`, `src/i18n/en.json`, `jest.setup.js` (add `require('@shopify/flash-list/jestSetup')`)
- Create: `src/components/FileRow.tsx`, `src/components/PdfThumbnail.tsx`, `src/components/SegmentedControl.tsx`, `src/components/SortMenu.tsx`, `src/components/SearchBar.tsx`, `src/components/FileActionsSheet.tsx`, `src/components/RenameDialog.tsx`, `src/components/FileInfoSheet.tsx`, `src/components/ScanProgressBanner.tsx`, `src/components/FolderRow.tsx`, `src/components/RecentCard.tsx`, `src/components/QuickToolsGrid.tsx`
- Test: `src/__tests__/screens/files.test.tsx`, `src/__tests__/screens/home.test.tsx`, `src/components/__tests__/FileActionsSheet.test.tsx`

**Interfaces:**
- Consumes: `useFiles` (Task 8), `useStorage` (Task 6), `useSettings` sort prefs, `queryFiles`, `groupByFolder`, `recentFiles`, `validatePdfFileName`, `formatDate` (Task 7), `formatBytes` (`src/utils/fileSize.ts`), `PermissionGate` (Task 9), `EmptyState`, `useTheme`.
- Produces:
  - `npx expo install @shopify/flash-list` (expect 2.0.2).
  - `FileRow({ file: FileRow; onPress(): void; onMore(): void })` — ≥ 72 dp row: `PdfThumbnail`, name (2 lines max), `formatBytes(size) · formatDate(modifiedAt) · {{count}} pages` (pages part only when known), star when favourite, "⋮" button (`accessibilityLabel` = `t('files.moreActions', { name })`).
  - `PdfThumbnail({ file: FileRow; width: number; height: number })` — `expo-image` of `thumbPath`; else `file-pdf-box` icon, `lock-outline` when `isEncrypted`; calls `useFiles.getState().requestThumb(file)` in an effect when `thumbPath` is null.
  - Files screen: `PermissionGate` → `SearchBar` (search-as-you-type, no debounce; `focus` route param `'search'` auto-focuses) → `SegmentedControl` (All / Recent / Favourites / Folders, `accessibilityRole="tab"`) → `SortMenu` (name / date / size + direction, from settings) → `ScanProgressBanner` (while `status === 'scanning'`: "Scanning… {{count}} PDFs found") → `FlashList` of `FileRow` (Folders segment: `FolderRow` list; tapping one shows that folder's files with a back chip) with `refreshing={status === 'scanning'}` and `onRefresh={() => refresh('full')}`; empty states per segment; tapping a row → `markOpened(id)` + `router.push('/reader/' + id)`; `notice` shown as a snackbar-style `Text` with `accessibilityLiveRegion="polite"`, then `clearNotice()`.
  - `FileActionsSheet({ file: FileRow | null; onClose(): void })` — `Modal` with: Add to/Remove from favourites, Rename (opens `RenameDialog`, validates with `validatePdfFileName`, shows the error text), Duplicate, Move to PDFToolkit folder (hidden when the file is already in `Documents/PDFToolkit`), File info (`FileInfoSheet`: name, folder, size, modified, pages, location), Delete (`Alert.alert(t('files.deleteTitle'), t('files.deleteBody', { name }), [Cancel, Delete (style 'destructive')])`; only the Delete button calls `remove`).
  - Home screen: `SearchBar` rendered as a button that navigates to `/files?focus=search`; "Recent" horizontal list of `RecentCard` from `recentFiles(files, 10)` (hidden when empty); `QuickToolsGrid` with Scan → `/scan`, Merge → `/tool/merge`, Compress → `/tool/compress`, Images to PDF → `/tool/images-to-pdf`; whole screen inside `PermissionGate`.
  - en.json additions (exact copy): `files.searchPlaceholder` "Search PDFs", `files.segmentAll` "All", `files.segmentRecent` "Recent", `files.segmentFavorites` "Favourites", `files.segmentFolders` "Folders", `files.sortName` "Name", `files.sortDate` "Date", `files.sortSize` "Size", `files.sortAsc` "Ascending", `files.sortDesc` "Descending", `files.sortBy` "Sort by", `files.pages` "{{count}} pages", `files.pages_one` "{{count}} page", `files.scanning` "Scanning… {{count}} PDFs found", `files.emptyAll` "No PDFs found yet", `files.emptyFavorites` "Star a file to see it here", `files.emptyRecent` "Files you open will show up here", `files.emptySearch` "No PDFs match \"{{query}}\"", `files.rootFolder` "Internal storage", `files.moreActions` "More actions for {{name}}", `files.favorite` "Add to favourites", `files.unfavorite` "Remove from favourites", `files.rename` "Rename", `files.duplicate` "Duplicate", `files.moveToApp` "Move to PDFToolkit folder", `files.info` "File info", `files.delete` "Delete", `files.deleteTitle` "Delete this PDF?", `files.deleteBody` "\"{{name}}\" will be permanently deleted from your phone.", `files.cancel` "Cancel", `files.save` "Save", `files.renameTitle` "Rename PDF", `files.errorEmpty` "Enter a name", `files.errorInvalidChars` "Names can't contain / \\ : * ? \" < > |", `files.errorTooLong` "That name is too long", `files.errorExists` "A file with that name already exists", `files.errorNotFound` "This file no longer exists", `files.errorPermission` "PDF Toolkit can't change this file", `files.errorUnknown` "Something went wrong", `files.infoName` "Name", `files.infoFolder` "Folder", `files.infoSize` "Size", `files.infoModified` "Modified", `files.infoPages` "Pages", `files.infoLocation` "Location", `files.back` "Back to folders", `home.recent` "Recent", `home.tools` "Quick tools", `home.searchHint` "Search your PDFs", `tools.scan` "Scan", `tools.merge` "Merge", `tools.compress` "Compress", `tools.imagesToPdf` "Images to PDF".

- [ ] **Step 1: Write failing tests** (`renderRouter` on real `app/` with `onboardingDone: true`; seed `useFiles.setState({ files: [...] })` with 4 rows incl. `अहवाल.pdf` and a favourite; `useStorage.setState({ mode: 'full', ... })`; stub `useFiles` actions with `jest.fn`):
  - Files tab lists all 4 names; typing `'अहवाल'` in "Search PDFs" leaves only `अहवाल.pdf`; typing `'zzz'` shows `No PDFs match "zzz"`
  - pressing "Favourites" shows only the favourite; "Folders" shows folder rows with counts; tapping a folder shows its files and "Back to folders"
  - choosing Sort by → Name → Ascending orders rows A→Z and calls `setFilesSort('name','asc')`
  - pull-to-refresh handler calls `refresh('full')`; while `status 'scanning'` with progress `{ found: 12 }` → "Scanning… 12 PDFs found"
  - mode `'none'` → storage explainer instead of the list
  - `FileActionsSheet.test.tsx`: Delete → `Alert.alert` called with "Delete this PDF?"; invoking its destructive button calls `remove(id)`; Cancel does not; Rename with `'a/b'` shows "Names can't contain …" and does not call `rename`; Rename with `'New'` calls `rename(id, 'New.pdf')`; `rename` resolving `'exists'` shows "A file with that name already exists"
  - Home: Recent shows opened files first; pressing "Search your PDFs" navigates to Files with the search input focused; pressing "Merge" navigates to the `/tool/merge` placeholder
- [ ] **Step 2:** Run `npm test -- files home FileActionsSheet` → FAIL.
- [ ] **Step 3:** Implement the components and screens.
- [ ] **Step 4:** Run tests, typecheck, lint, format:check → pass.
- [ ] **Step 5:** Commit `feat: Files tab with segments, sort, search and file actions; Home recent row`.

### Task 11: Native build and emulator smoke test

**Files:**
- Modify only if something fails: any file from Tasks 2–10.

- [ ] **Step 1:** With JAVA_HOME/ANDROID_HOME set: `npx expo prebuild --platform android --clean` → OK. `cd android && ./gradlew :pdf-native:testDebugUnitTest assembleDebug` → `BUILD SUCCESSFUL`.
- [ ] **Step 2:** Start the emulator in the background: `$ANDROID_HOME/emulator/emulator -avd Pixel_10a -no-snapshot-load` and wait for `adb shell getprop sys.boot_completed` → `1`. Then `npx expo run:android` (installs the dev client and starts Metro).
- [ ] **Step 3:** Seed files: `adb push __fixtures__/one-page.pdf __fixtures__/two-hundred-pages.pdf __fixtures__/protected.pdf /sdcard/Download/`; `adb push __fixtures__/mixed-sizes.pdf __fixtures__/corrupted.pdf "__fixtures__/अहवाल.pdf" /sdcard/Documents/`; `adb shell mkdir -p /sdcard/Download/.hidden && adb push __fixtures__/one-page.pdf /sdcard/Download/.hidden/secret.pdf`.
- [ ] **Step 4:** Onboarding: `adb exec-out screencap -p > <scratchpad>/m2-onboarding.png` and view it → slide 1 text visible. Drive the UI by finding buttons in `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml` (match `content-desc`/`text`, tap the bounds centre with `adb shell input tap x y`): Next, Next, "Allow access to all files" → system settings page opens → `adb shell appops set --uid com.pdfkagaz.pdftoolkit MANAGE_EXTERNAL_STORAGE allow` → `adb shell input keyevent KEYCODE_BACK`.
- [ ] **Step 5:** Files tab screenshot shows exactly 6 PDFs (not `secret.pdf`), `अहवाल.pdf` rendered correctly, thumbnails for the readable files, a lock icon for `protected.pdf`, a placeholder for `corrupted.pdf`, page count "200 pages" on the big file.
- [ ] **Step 6:** F-04: press Home (`adb shell input keyevent KEYCODE_HOME`), `adb push __fixtures__/one-page.pdf /sdcard/Download/new-from-whatsapp.pdf`, relaunch via `adb shell monkey -p com.pdfkagaz.pdftoolkit 1` → within a few seconds the new file is listed (screenshot).
- [ ] **Step 7:** F-07: on `one-page.pdf` use ⋮ → Duplicate (→ `one-page (copy).pdf` appears, `adb shell ls /sdcard/Download` confirms), Rename to `renamed` (→ `renamed.pdf`), Move to PDFToolkit folder (→ `adb shell ls /sdcard/Documents/PDFToolkit` shows it), Delete (confirm dialog shown; file gone from list and disk).
- [ ] **Step 8:** Performance: `adb shell 'mkdir -p /sdcard/Documents/bulk && for i in $(seq 1 1000); do cp /sdcard/Download/two-hundred-pages.pdf /sdcard/Documents/bulk/p$i.pdf; done'`; pull to refresh; `adb logcat -d -s ReactNativeJS | grep "\[scan\] full"` → duration < 5000 ms with ≥ 1000 files. Scroll the list (`adb shell input swipe 500 1800 500 300 100` ×10) without a crash. Remove the bulk folder afterwards.
- [ ] **Step 9:** Denial path: `adb shell appops set --uid com.pdfkagaz.pdftoolkit MANAGE_EXTERNAL_STORAGE deny`, background and relaunch → storage explainer shown (cached rows are not shown in `'none'` mode, no crash). Tap "Pick folders instead", pick `Documents` in the system picker (uiautomator), confirm → list shows the 3 Documents PDFs; Settings shows "Scanned folders" with Documents.
- [ ] **Step 10:** If any step needed a fix, run `npm test && npm run typecheck && npm run lint && npm run format:check` and commit `fix: …`; otherwise commit nothing. Record which steps passed (with screenshot paths) in the task report.
