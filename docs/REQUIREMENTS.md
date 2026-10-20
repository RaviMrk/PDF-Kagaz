# PDF Toolkit App — Requirements (PRD + Tech Spec)

Oct 20, 2026 · @Ravi

## 1. Overview

Build an offline-first Android app that finds every PDF on the phone, opens it fast, and offers the common PDF tools (merge, split, compress, scan, sign, protect) without uploading files anywhere.

**Working name:** PDF Toolkit (rename later).

**Target users:** students, small-business owners and office workers who receive PDFs on WhatsApp/email and need to read, edit lightly and re-share them. Secondary: users who prefer Marathi/Hindi UI.

**Platform:** Android first (min SDK 24 / Android 7.0, target SDK 36). Built with **React Native + Expo (development build, not Expo Go)** plus one local native module in Kotlin for heavy PDF work. iOS is out of scope for v1.

**Monetization:** free with ads (AdMob banner on lists, interstitial only after a tool finishes). No ads inside the reader screen. Optional one-time "Remove ads" purchase later.

**Core principles**

- Every operation runs on-device; no file ever leaves the phone unless the user taps Share.
- Original files are never overwritten unless the user explicitly chooses "Replace original".
- Any tool should finish a 50-page, 10 MB PDF in under 10 seconds on a mid-range phone.

## 2. Scope by release

Ship MVP first (reader + 6 core tools), then add the heavier native tools in v1.1. Feature IDs refer to section 3.

| Release | Features | Why in this release |
| --- | --- | --- |
| MVP (v1.0) | Storage scan (F-01–F-05), reader (V-01–V-10), merge, split, rotate/reorder/delete pages, images to PDF, camera scan, share/print | Covers 80% of daily use; all doable with pdf-lib + ML Kit scanner |
| v1.1 | Compress, password protect/unlock, PDF to images, watermark, page numbers, sign, recent/favourites sync polish | Need the native Kotlin module (PDFBox-Android / PdfRenderer) |
| v1.2 | OCR (searchable PDF), text search inside PDF, annotate (highlight, freehand, notes), Marathi/Hindi UI | Highest effort; depends on text-layer work |
| Later | PDF to Word, Word to PDF, cloud import (Drive), form filling, iOS | Need server or heavy libraries; validate demand first |

**Out of scope for v1:** user accounts, cloud sync, any server, editing existing PDF text.

## 3. Functional requirements

Each requirement has an ID so you can reference it in Claude Code prompts ("implement F-01 to F-05"). Priority: P0 = MVP, P1 = v1.1, P2 = v1.2+.

### 3.1 File discovery (scan PDFs from storage)

| ID | Requirement | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| F-01 | On first launch, request All Files Access; if denied, fall back to the system file picker (SAF) | Both paths lead to a working PDF list; denial never crashes or blocks the app | P0 |
| F-02 | Scan all storage for `.pdf` files (internal + SD card), skipping hidden/system folders and `Android/data` | 1,000 PDFs indexed in under 5 s; progress shown; runs off the UI thread | P0 |
| F-03 | Cache the index in a local DB (path, name, size, modified date, page count, thumbnail path) | Reopening the app shows the list instantly from cache, then refreshes in background | P0 |
| F-04 | Pull-to-refresh and auto-rescan when the app returns to foreground (only changed folders) | New WhatsApp PDF appears without restarting the app | P0 |
| F-05 | List views: All, Recent, Favourites, By folder; sort by name/date/size; search by file name | Search filters as you type, under 100 ms for 1,000 files | P0 |
| F-06 | Open a PDF shared from another app ("Open with" / share intent) | App appears in Android's open-with sheet for `application/pdf` | P0 |
| F-07 | File actions: rename, delete, duplicate, file info, move to app folder | Delete asks for confirmation; list updates immediately | P0 |

### 3.2 Reader

| ID | Requirement | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| V-01 | Render PDF pages with smooth vertical scroll | 60 fps scroll on a 200-page file; first page visible in under 1 s | P0 |
| V-02 | Pinch zoom and double-tap zoom | Text stays sharp at 400% zoom | P0 |
| V-03 | Page indicator and jump-to-page | Typing 57 jumps to page 57 | P0 |
| V-04 | Thumbnail strip / grid of pages | Tapping a thumbnail jumps to that page | P0 |
| V-05 | Remember last-read page per file | Reopening resumes at the same page | P0 |
| V-06 | Night mode (inverted), sepia, and keep-screen-on toggle | Setting persists per user | P0 |
| V-07 | Horizontal (page-by-page) mode | Toggle in reader menu | P0 |
| V-08 | Open password-protected PDFs | Prompts for password; wrong password shows a clear error | P0 |
| V-09 | Bookmarks (user) and table of contents (from PDF outline) | Both listed in a side sheet | P0 |
| V-10 | Share, print (Android print service), open-with from reader | Works for files of any size | P0 |
| V-11 | Text search with highlighted hits and next/previous | Finds all hits in a 100-page text PDF | P2 |
| V-12 | Annotations: highlight, underline, freehand pen, text note; save as new PDF | Annotations visible in other PDF readers | P2 |

### 3.3 PDF tools

Every tool follows the same flow: pick file(s) → options → progress → result screen (Open, Share, Save as). Output goes to `Documents/PDFToolkit/` by default.

| ID | Tool | Options and acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-01 | Merge PDFs | Pick 2–50 files, drag to reorder; output keeps page sizes | P0 |
| T-02 | Split PDF | By page ranges ("1-3, 5, 8-10"), every N pages, or extract selected pages | P0 |
| T-03 | Organise pages | Grid of thumbnails: drag to reorder, rotate 90°, delete, duplicate; save | P0 |
| T-04 | Images to PDF | Pick from gallery, reorder, page size (A4/Letter/fit), margins, orientation | P0 |
| T-05 | Camera scan to PDF | Auto edge detection, crop, filters (B&W, greyscale, colour), multi-page | P0 |
| T-06 | Compress PDF | Low/Medium/High; show before → after size; warn if output is larger | P1 |
| T-07 | Protect with password | Set open password (AES-256); confirm field | P1 |
| T-08 | Remove password | Requires the current password | P1 |
| T-09 | PDF to images | JPG/PNG, all or selected pages, DPI 72/150/300; save to gallery | P1 |
| T-10 | Add watermark | Text or image, opacity, angle, position, page range | P1 |
| T-11 | Add page numbers | Position, format ("1", "Page 1 of N"), start number, font size | P1 |
| T-12 | Sign PDF | Draw signature once, save it, place/resize on any page | P1 |
| T-13 | OCR | Make scanned PDF searchable; English first, then Devanagari | P2 |
| T-14 | Edit metadata | Title, author, subject, keywords | P2 |

### 3.4 App-level

- **A-01** Settings: theme (system/light/dark), default save folder, scan quality, language, clear cache. (P0)
- **A-02** Onboarding: 3 screens max, ending at the permission request. (P0)
- **A-03** Ads: AdMob banner on home/list; interstitial after a completed tool, max once per 3 minutes; Google UMP consent form. (P0)
- **A-04** Crash reporting and anonymous usage events (tool used, success/fail, duration). No file names or content in events. (P0)
- **A-05** In-app review prompt after 3 successful tool uses. (P1)

## 4. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | Cold start under 2 s; list of 1,000 files scrolls at 60 fps (use FlashList); thumbnails generated lazily and cached |
| Memory | No out-of-memory crash on a 500-page or 100 MB PDF; heavy tools stream pages instead of loading the whole file into JS |
| Privacy | Fully offline for all features; no file content or names sent anywhere; privacy policy states this |
| Reliability | Tools write to a temp file first, then move into place, so a crash never corrupts the original |
| Background work | Long tools (compress, OCR, big merges) keep running if the user leaves the screen, with a notification |
| App size | APK/AAB under 40 MB (ML Kit models downloaded on demand via Play services) |
| Accessibility | All buttons have labels for TalkBack; touch targets at least 48 dp; supports system font scaling |
| Localisation | All strings in i18n files from day one (English first; Marathi and Hindi in v1.2) |
| Compatibility | Android 7.0+ (API 24); tested on Android 10, 11, 13, 14 and latest |
| Code quality | TypeScript strict mode, ESLint + Prettier, unit tests for every PDF service function |

## 5. Android permissions and Play Store policy

Scanning the whole phone for PDFs needs **All Files Access (`MANAGE_EXTERNAL_STORAGE`)** on Android 11+; normal storage permissions no longer expose other apps' PDFs. Play allows it for document management apps, but you must justify in the Play Console declaration why the Storage Access Framework is not enough ([Play policy](https://support.google.com/googleplay/android-developer/answer/9956427), [Android docs](https://developer.android.com/training/data-storage/manage-all-files)). Rejection is a real risk, so the app must work without it.

| Android version | Permission used | Behaviour |
| --- | --- | --- |
| 7–10 (API 24–29) | `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` (add `requestLegacyExternalStorage` for 10) | Full scan works with the normal runtime prompt |
| 11+ (API 30+) | `MANAGE_EXTERNAL_STORAGE` via the Settings screen | Full scan if granted |
| 11+, denied or Play rejects it | Storage Access Framework: user picks folders (`OPEN_DOCUMENT_TREE`), app persists URI grants | Scan only the folders the user added (suggest Download, WhatsApp Documents) |
| All | `CAMERA` | Not needed: the ML Kit scanner uses Play services' camera access (section 11) |
| 13+ | `POST_NOTIFICATIONS` | Only for long-running tool progress |
| All | `INTERNET`, `ACCESS_NETWORK_STATE`, `AD_ID` | Ads only |

**Rules for the build**

- Put the storage layer behind one interface (`StorageProvider`) with two implementations: `FullAccessProvider` and `SafProvider`. All screens use the interface only.
- Show a pre-permission screen explaining why ("to find all your PDFs") before sending the user to Settings.
- Keep a build flavor `play-saf` with `MANAGE_EXTERNAL_STORAGE` removed from the manifest, in case the Play declaration is rejected.
- Prepare for the declaration form: a short screen-recorded video of the scan feature and a one-paragraph justification.

## 6. Tech stack

Use JavaScript libraries where they are fast enough and one local Kotlin module (Expo Modules API) for everything that needs real file access or heavy processing. Check each library's latest stable version and Expo compatibility before installing; versions are not pinned here.

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | Expo SDK 57 (`expo@57.0.9`+, React Native 0.86) with `expo-dev-client`, TypeScript strict | Expo Go cannot load the native modules below |
| Navigation | Expo Router | File-based routes, matches section 8 |
| State | Zustand | Small, no boilerplate |
| Local DB | `expo-sqlite` + Drizzle ORM | File index, recents, favourites, bookmarks, last page |
| Key-value prefs | `react-native-mmkv` | Theme, settings, onboarding flag |
| Lists | `@shopify/flash-list` | 1,000+ file lists |
| PDF viewing | `react-native-pdf` 7.x (needs `react-native-blob-util`) | Zoom, paging, password, outline; no text search |
| Light PDF editing | `@cantoo/pdf-lib` (maintained fork) | Merge, split, reorder, rotate, delete, images to PDF, watermark, page numbers, stamping a signature image |
| Native module `pdf-native` (Kotlin) | Android `PdfRenderer` + PdfBox-Android (`com.tom-roush:pdfbox-android`) | Storage scan, thumbnails, PDF to images, compress, encrypt/decrypt, text extraction for search |
| Document scanner | Google ML Kit Document Scanner (wrap in `pdf-native`, or use a maintained RN plugin) | Edge detection, crop, filters handled by Google UI |
| OCR | ML Kit Text Recognition v2 (Latin + Devanagari) | v1.2 |
| Files and sharing | `expo-file-system`, `expo-sharing`, `expo-document-picker`, `expo-print` | Share/print/save-as |
| Gestures and drag | `react-native-gesture-handler`, `react-native-reanimated`, `react-native-draggable-flatlist` | Page organiser, merge order |
| Signature | `react-native-signature-canvas` | Export PNG, stamp with pdf-lib |
| i18n | `i18next` + `react-i18next` + `expo-localization` | en, mr, hi |
| Ads | `react-native-google-mobile-ads` (includes UMP consent) | Test ad unit IDs in dev |
| Crash + analytics | Firebase Crashlytics + Analytics (`@react-native-firebase`) | No PII in events |
| Build | EAS Build (AAB), EAS Submit | `development`, `preview`, `production` profiles |

**pdf-lib limit:** it loads the whole file into JS memory. Route files over about 30 MB, or any merge over 100 MB total, to the Kotlin module instead.

### 6.1 Stack decision: Expo vs native Kotlin vs Flutter

**Decision (Oct 20, 2026): Expo / React Native**, as described in sections 6–9.

For this app, native Kotlin with Jetpack Compose is the best technical fit; Expo/React Native is the reasonable alternative if skill reuse or iOS matters more.

**Why native fits this app.** Almost every hard part runs on the device: storage scanning, All Files Access, page rendering, PdfBox (compress, encrypt), the ML Kit scanner and long background jobs. In the Expo plan all of that already sits in a Kotlin module, so React Native becomes mostly a UI layer. Going native removes that bridge:

- Calls Android's PdfRenderer and PdfBox directly, with no dependence on react-native-pdf keeping up with New Architecture changes.
- No risk of large PDFs overloading the JavaScript thread.
- Smaller app and faster start.
- WorkManager background jobs and the "Open with" integration are first-class.
- Avoids one class of 16 KB page-size and dependency-compatibility issues.

**Why Expo might still be right.** It matches existing React skills, the freelance group plans several simple ad-supported apps where shared code and skills pay off, and it keeps iOS open for later.

| Criterion | Kotlin + Compose | Expo / React Native | Flutter |
| --- | --- | --- | --- |
| Fit for heavy file/PDF work | Best: direct API access | Good, but needs the Kotlin module anyway | Same problem, plus Dart plugins |
| Existing skills (React) | New language; Claude Code writes it well | Strongest match | New language, least reuse |
| iOS later | Rewrite | Mostly reusable | Mostly reusable |
| Reuse across the group's other apps | Low | High | Medium |
| Debugging solo | Harder at first | Easiest | Harder |

Flutter is not recommended: it has the same native-plugin problem as React Native and builds on none of the existing skills.

## 7. Architecture, folders and data model

Screens never touch PDF libraries or the file system directly; they call a thin TypeScript services layer, which drops to the Kotlin module for heavy or native-only work.

Layers (top to bottom):

1. **Screens** (`app/`, Expo Router) and components (`src/components/`)
2. **Stores** (Zustand) and **services** (`src/services/*`: storage, pdf, ads, analytics)
3. **Engines**: `@cantoo/pdf-lib` (JS) for light edits; `pdf-native` (Kotlin) for scan, render, compress, encrypt, text
4. **Persistence**: SQLite (Drizzle) for the index and history; MMKV for preferences; the file system for PDFs

This split lets every PDF operation be tested with Jest, and lets you swap pdf-lib for native code later without touching screens.

### 7.1 Folder structure

```text
pdf-toolkit/
├─ app/                         # Expo Router routes (section 8)
│  ├─ (tabs)/home.tsx, files.tsx, tools.tsx, settings.tsx
│  ├─ reader/[id].tsx
│  ├─ tool/[toolId].tsx, tool/organize/[id].tsx
│  └─ scan.tsx, signature.tsx, result.tsx, onboarding.tsx
├─ src/
│  ├─ components/               # FileRow, PdfThumbnail, ToolCard, PagePicker...
│  ├─ services/
│  │  ├─ storage/               # StorageProvider, FullAccessProvider, SafProvider
│  │  ├─ pdf/                   # merge.ts, split.ts, organize.ts, imagesToPdf.ts, watermark.ts...
│  │  ├─ native/                # typed wrappers around pdf-native
│  │  ├─ ads/
│  │  └─ analytics/
│  ├─ db/                       # Drizzle schema + migrations
│  ├─ stores/                   # Zustand stores
│  ├─ i18n/                     # en.json, mr.json, hi.json
│  ├─ theme/
│  └─ utils/                    # page-range parser, file size, paths
├─ modules/pdf-native/          # Expo module, android/src/.../PdfNativeModule.kt
├─ __fixtures__/                # test PDFs (section 10)
├─ docs/REQUIREMENTS.md
├─ CLAUDE.md
└─ app.json, eas.json
```

### 7.2 Data model (SQLite)

| Table | Columns | Purpose |
| --- | --- | --- |
| `files` | id (hash of uri), uri, name, folder, size\_bytes, modified\_at, page\_count, thumb\_path, is\_encrypted, is\_favorite, last\_page, last\_opened\_at, source (scan / saf / intent / output) | Index of every PDF found; drives lists, recents, resume |
| `bookmarks` | id, file\_id, page, label, created\_at | User bookmarks (V-09) |
| `scan_roots` | uri, label, added\_at | Folders the user picked in SAF mode |
| `tool_jobs` | id, tool\_id, input\_ids (JSON), options (JSON), status, output\_uri, error, started\_at, finished\_at | Progress, retry and history of tool runs |
| `signatures` | id, png\_path, created\_at | Saved signatures (T-12) |

### 7.3 Native module API (`pdf-native`)

```ts
scanPdfs(roots?: string[]): Promise<PdfFileInfo[]>
hasAllFilesAccess(): Promise<boolean>
openAllFilesAccessSettings(): Promise<void>
generateThumbnail(uri: string, page: number, width: number): Promise<string>
getPageCount(uri: string, password?: string): Promise<number>
pdfToImages(uri: string, pages: number[], dpi: number, format: 'jpg' | 'png'): Promise<string[]>
compress(uri: string, level: 'low' | 'medium' | 'high'): Promise<{ outUri: string; before: number; after: number }>
encrypt(uri: string, password: string): Promise<string>
decrypt(uri: string, password: string): Promise<string>
extractText(uri: string): Promise<{ page: number; text: string }[]>
scanDocument(options: { pageLimit?: number }): Promise<string>  // ML Kit, returns PDF uri
```

## 8. Screens and navigation

Four bottom tabs (Home, Files, Tools, Settings) plus full-screen stacks for the reader, each tool and the scanner.

| Route | Screen | Key contents |
| --- | --- | --- |
| `/onboarding` | Onboarding (3 slides) | Value props, then permission explainer and Grant / Pick folders buttons |
| `/(tabs)/home` | Home | Search bar, Recent (horizontal), quick tools grid (Scan, Merge, Compress, Images to PDF), banner ad |
| `/(tabs)/files` | All files | Segmented: All / Favourites / Folders; sort menu; FlashList with thumbnail, name, size, date, page count; long-press multi-select |
| `/(tabs)/tools` | Tools | Grid of every tool from T-01 to T-14, grouped: Organise, Convert, Optimise, Security, Edit |
| `/(tabs)/settings` | Settings | A-01 options, manage scanned folders (SAF mode), remove ads, privacy policy, about |
| `/reader/[id]` | Reader | PDF view, top bar (title, search, bookmark, more), bottom bar (page x/y, thumbnails, night mode), side sheet for TOC/bookmarks |
| `/tool/[toolId]` | Tool flow | Step 1 pick files → step 2 options → progress → result |
| `/tool/organize/[id]` | Page organiser | Draggable thumbnail grid with rotate/delete/duplicate, Save |
| `/scan` | Scanner | Launches ML Kit scanner, then review pages, filter, reorder, name, Save |
| `/signature` | Signature pad | Draw, clear, save to reuse |
| `/result` | Result | Output thumbnail, size, Open / Share / Save as / Done; interstitial ad slot after leaving |

**Shared components:** `FileRow`, `PdfThumbnail`, `ToolCard`, `PagePicker` (range input + grid), `ProgressSheet`, `PasswordDialog`, `EmptyState`, `PermissionGate`, `AdBanner`.

## 9. Build plan

Work in 8 milestones, committing after every milestone.

1. **Scaffold.** Create the Expo TypeScript project with Expo Router, the folder structure in section 7, the 4 bottom tabs from section 8 as placeholders, i18n, theme (light/dark), MMKV and SQLite with the Drizzle schema in section 7. Set up ESLint, Prettier, Jest.
2. **Storage scan (F-01 to F-07).** Create the local Expo module `modules/pdf-native` in Kotlin with `scanPdfs(roots)`, `hasAllFilesAccess()`, `openAllFilesAccessSettings()`, `generateThumbnail(path, page, width)`. Implement StorageProvider with FullAccessProvider and SafProvider per section 5. Build onboarding + PermissionGate, and the Files tab with search, sort, favourites.
3. **Reader (V-01 to V-10).** Build `/reader/[id]` with react-native-pdf: zoom, page indicator, jump-to-page, thumbnail strip, last-page resume, night/sepia mode, horizontal mode, password dialog, bookmarks + outline side sheet, share and print. Register the app as an opener for application/pdf intents (F-06).
4. **Tool framework + Merge/Split/Organise (T-01 to T-03).** Create the generic tool flow (pick → options → progress → result) and `src/services/pdf/{merge,split,organize}.ts` using pdf-lib, with tests. Build the draggable page organiser.
5. **Images to PDF + Scanner (T-04, T-05).** Implement images-to-PDF with page size/margin options, and the camera scanner using ML Kit Document Scanner through pdf-native.
6. **Ads, analytics, polish (A-01 to A-04).** Add AdMob with UMP consent, banner on Home/Files, interstitial after tool completion with 3-minute cap, Crashlytics, settings screen. Then run the release checklist in section 10. → **Release MVP.**
7. **v1.1 native tools (T-06 to T-12).** Add compress, protect, unlock, PDF to images in pdf-native using PdfBox-Android/PdfRenderer; add watermark, page numbers, sign using pdf-lib. Route large files to native per section 6.
8. **v1.2 (V-11, V-12, T-13, Marathi/Hindi).** Add text extraction + search, annotations saved as new PDF, ML Kit OCR producing a searchable PDF, and mr/hi translations.

Test on a real device after each milestone, because the storage and scanner features don't work properly on emulators without files.

## 10. Testing, release and risks

### 10.1 Test fixtures

Keep these in `__fixtures__/` and run every tool against all of them: a 1-page text PDF, a 200-page text PDF, a 50 MB scanned PDF, a password-protected PDF, a PDF with mixed page sizes and rotations, a PDF with an outline/TOC, a corrupted PDF, and a file with a Marathi name.

### 10.2 Release checklist

- [ ] All P0 acceptance criteria in section 3 pass on a real Android 11+ device and an Android 9 device
- [ ] Denying All Files Access still gives a working app (SAF mode)
- [ ] Tested on a low-RAM phone (3 GB or less) with the 50 MB fixture
- [ ] Test ad IDs replaced with production IDs; UMP consent shows in EU test mode
- [ ] Privacy policy URL live (offline processing, ads, Crashlytics)
- [ ] Play Console: data safety form, All Files Access declaration + demo video, content rating, target audience
- [ ] Store listing: 8 screenshots, feature graphic, short and long description
- [ ] Signed AAB from EAS production profile; internal testing track first
- [ ] targetSdkVersion 36 and every native `.so` passes the 16 KB page-size check (test on a 16 KB emulator image)

### 10.3 Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Play rejects All Files Access | App can't auto-scan the phone | SAF folder mode built from day one; `play-saf` flavor ready |
| Large files crash the JS thread | Bad reviews, ANRs | Route big files to the Kotlin module; size checks before running a tool |
| `react-native-pdf` lacks text search/annotations | V-11/V-12 harder | Do search via native text extraction; consider a native viewer later |
| Crowded market (many free PDF apps) | Low installs | Differentiate on no-upload privacy, speed, Marathi/Hindi UI, no ads in reader |
| Ad placement hurts ratings | Uninstalls | Strict frequency cap; never interrupt reading |

### 10.4 Open questions

- Final app name and package ID (e.g. `com.<yourgroup>.pdftoolkit`).
- Will "Remove ads" be a one-time purchase, and at what price?
- Do you want a commercial PDF SDK later (better viewer/annotations, paid licence) or stay fully open-source?

## 11. Research findings

The planned stack holds up, with four changes: build on Expo SDK 57, use react-native-pdf 7.x, drop the CAMERA permission, and treat target API 36 and 16 KB page-size support as release blockers. Checked Oct 20, 2026.

| Item | Finding | What it changes |
| --- | --- | --- |
| Expo SDK | SDK 57 is on React Native 0.86; use `expo@57.0.9` or later (fixes a Hermes memory regression affecting Reanimated/Worklets apps). SDK 58 is now the npm `latest` | Start on SDK 57; upgrade to 58 once react-native-pdf and other native libs confirm support |
| Expo local modules | Since SDK 56 Expo modules can be defined directly inside the project | `modules/pdf-native` lives in-repo with no separate package |
| New Architecture | Mandatory from RN 0.82; it cannot be turned off | Every native library must support Fabric/TurboModules |
| react-native-pdf | 7.x adds Fabric fixes and Android 16 KB page-size support; 6.x had blank-render reports under the New Architecture | Pin 7.x; test rendering on a real device in milestone 3 |
| pdf-lib | Original package inactive since 1.17.1 (Nov 2021). Cantoo maintains `@cantoo/pdf-lib` | Use `@cantoo/pdf-lib`; keep all calls inside `src/services/pdf` |
| PdfBox-Android | Latest 2.0.27.0, Apache 2.0; pure Java | Fine for compress/encrypt/text; no 16 KB issue |
| ML Kit Document Scanner | No camera permission, API 21+, models and UI via Play services | Remove CAMERA from the manifest |
| 16 KB page size | Required since Nov 1, 2025 for apps targeting Android 15+ on 64-bit devices | Release blocker: check every `.so` |
| Target API | Play requires API 36 for new apps and updates since Aug 31, 2026 | Set `targetSdkVersion` 36 |
| All Files Access | Allowed for document management apps with a Console justification | SAF fallback stays mandatory |

### 11.1 Competitor angle

Big names (Adobe Acrobat Reader, Xodo, Foxit, iLovePDF, PDFelement, PDF Extra) gate tools behind daily caps or subscriptions. Our angle: unlimited tools with no caps or subscription, fully offline, Marathi and Hindi UI, fast and small.
