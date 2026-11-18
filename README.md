# PDF Kagaz

An offline-first PDF reader and toolkit for Android. It finds every PDF on your phone, opens it
fast and gives you the everyday tools: merge, split, scan, compress, sign, protect and OCR. Your
files never leave the device.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Platform: Android 7.0+](https://img.shields.io/badge/platform-Android%207.0%2B-3DDC84.svg)
![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020.svg)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)

> The app's working name, shown on the phone, is **PDF Toolkit**.

## Contents

- [Why](#why)
- [Features](#features)
- [Privacy](#privacy)
- [Getting started](#getting-started)
- [Development](#development)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Why

Most of us get PDFs on WhatsApp or email and only need to read them, fix them up a little and
send them on. Many PDF apps upload your files to a server to do this. PDF Kagaz does all of it on
the phone, works without a network connection, and never overwrites your original unless you ask
it to.

## Features

### Find and read

- Scans internal storage and SD cards for PDFs and keeps an index, so the list opens instantly.
  New files (for example, a PDF that just arrived on WhatsApp) show up without a restart.
- Has All, Recent, Favourites and By-folder views, with sorting and instant search by name.
- Shows up in Android's "Open with" and share sheets for PDFs.
- The reader has smooth scrolling, pinch and double-tap zoom, jump to page and a thumbnail grid.
  It also has night and sepia modes, page-by-page mode, bookmarks and the table of contents.
- Opens password-protected PDFs, remembers your last page, and can share and print.

### Tools

Every tool follows the same steps: pick files, set options, watch the progress, then open or
share the result. Long jobs keep running in the background with a notification and a Cancel
button.

| Tool             | What it does                                                                |
| ---------------- | --------------------------------------------------------------------------- |
| Merge            | Combine 2–50 PDFs in the order you choose                                   |
| Split            | Split by page ranges (`1-3, 5, 8-10`), every N pages, or extract pages      |
| Organise pages   | Reorder, rotate, delete and duplicate pages in a thumbnail grid             |
| Images to PDF    | Turn photos into a PDF, with page size, margins and orientation             |
| Scan             | Camera scan with edge detection, crop and filters (ML Kit Document Scanner) |
| Compress         | Low, medium and high settings, with the before and after size               |
| Protect / Unlock | Add an AES-256 open password, or remove one you know                        |
| PDF to images    | Save pages as JPG or PNG at 72, 150 or 300 DPI                              |
| Watermark        | Add a text or image stamp, with opacity, angle, position and page range     |
| Page numbers     | Choose the position, format (`1` or `Page 1 of N`), start number and size   |
| Sign             | Draw a signature once, then place and resize it on any page                 |
| OCR              | Make a scanned PDF searchable with an invisible text layer (Latin script)   |

Results are saved to `Documents/PDFToolkit/` (images to `Pictures/PDFToolkit/`) as new files.

## Privacy

- **Everything runs on the device.** OCR uses Google ML Kit's bundled on-device model, so it
  works in airplane mode too.
- **Nothing is uploaded.** A file leaves the phone only when you tap Share.
- **Originals are safe.** Each tool writes to a temporary file first and then moves the
  finished file into place. A crash can't corrupt your original, and it's never replaced unless
  you choose "Replace original".
- **Optional crash reporting.** Firebase Crashlytics and Analytics are compiled in only if you
  supply your own `google-services.json`. Events never include file names or content.
- **Ads are off.** The ad code exists but is disabled unless `ADS_ENABLED=true`.

## Getting started

### Requirements

- macOS, Linux or Windows with **Node.js 20.19.4+** (developed on Node 24) and npm
- **JDK 17** (newer JDKs, such as Android Studio's bundled JDK 25, break the React Native CMake
  tasks)
- Android SDK with platform 36, plus an emulator or a device running Android 7.0 (API 24) or newer

This is an Expo **development build**, not an Expo Go project: the app ships its own native
module, so Expo Go can't run it.

### Build and run

```sh
git clone https://github.com/RaviMrk/PDF-Kagaz.git
cd PDF-Kagaz
npm install

export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=~/Library/Android/sdk   # or your SDK path

npx expo run:android   # generates android/, builds the dev client and installs it
```

After the first build, `npm start` starts Metro for the installed dev client.

### Optional configuration

The app builds and runs with none of these set.

| Setting                                                                     | Purpose                                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `google-services.json` in the project root (or `GOOGLE_SERVICES_JSON` path) | Turns on Firebase Crashlytics and Analytics                                             |
| `APP_VARIANT=play-saf`                                                      | A build without All Files Access that uses only the folders the user picks              |
| `ADS_ENABLED=true`                                                          | Turns ads on (Google's test IDs unless `APP_ENV=production`)                            |
| `APP_ENV=production`                                                        | Release builds. Requires `PRIVACY_POLICY_URL` (https), and real AdMob IDs if ads are on |

Release builds use EAS (`eas.json` has `development`, `preview`, `production` and
`production-saf` profiles). To build a release APK on your machine:

```sh
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

A local release build is signed with the debug key, so it's fine for testing but can't go to
Google Play.

## Development

| Command                           | What it does                                      |
| --------------------------------- | ------------------------------------------------- |
| `npm start`                       | Start Metro for the dev client                    |
| `npm run android`                 | Build and run on a device or emulator             |
| `npm test`                        | Jest unit and component tests                     |
| `npm run typecheck`               | TypeScript (`tsc --noEmit`)                       |
| `npm run lint`                    | ESLint                                            |
| `npm run format` / `format:check` | Prettier                                          |
| `npm run db:generate`             | Generate Drizzle migrations after a schema change |
| `npm run fixtures:*`              | Regenerate the test PDFs in `__fixtures__/`       |
| `npm run licenses`                | Rebuild the open-source licenses screen           |

Kotlin tests for the native module (Robolectric) run from the generated Android project:

```sh
cd android && ./gradlew :pdf-native:testDebugUnitTest
```

After adding or renaming a route, run `npx expo start` once so Expo Router regenerates its types
before `npm run typecheck`. After changing native config or plugins, run
`npx expo prebuild --clean`.

## Project structure

```text
app/                    Expo Router screens (tabs, reader, tool flow, scanner, result)
src/
  components/           Shared UI components
  services/             All app logic: pdf, storage, tools, reader, index, intent, ...
  stores/               Zustand stores
  db/                   expo-sqlite + Drizzle schema and migrations
  i18n/                 i18next strings (en.json)
  theme/, utils/, config/
modules/pdf-native/     Local Expo module in Kotlin (PdfBox-Android, PdfRenderer, ML Kit)
plugins/                Expo config plugins (storage permissions, intent filters, backup rules)
__fixtures__/           Test PDFs and images
scripts/                Fixture and license generators
docs/                   Requirements, release notes, implementation plans
```

## Architecture

Screens never use PDF libraries or the file system directly. They call a thin TypeScript
services layer, which hands heavy or native-only work to the Kotlin module.

```text
Screens (app/) and components
        │
Stores (Zustand) and services (src/services/*)
        │
Engines: @cantoo/pdf-lib (JS, light edits) · pdf-native (Kotlin: scan, render,
         compress, encrypt, OCR)
        │
SQLite + Drizzle (index, history) · MMKV (preferences) · file system (PDFs)
```

- **Storage** goes through one `StorageProvider` interface with two implementations: All Files
  Access, and the Storage Access Framework for users who decline it or for the `play-saf` build.
- **Tools** write to a temporary file and then move it into the output folder.
- **The native module** (`modules/pdf-native`) uses PdfBox-Android for compression, encryption,
  stamping and the OCR text layer. It uses Android's `PdfRenderer` for thumbnails and page images,
  and ML Kit Text Recognition for OCR.

The full product and technical spec is in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), and the
release checklist and measurements are in [docs/RELEASE.md](docs/RELEASE.md).

## Roadmap

Planned (not built yet):

- [ ] Text search inside a PDF, with highlighted results
- [ ] Annotations: highlight, underline, pen and notes
- [ ] Marathi and Hindi translations
- [ ] Devanagari OCR
- [ ] Edit metadata (title, author, subject, keywords)

Later ideas: PDF to Word, Word to PDF, Google Drive import, form filling and iOS.

Known limitations are listed in [docs/RELEASE.md](docs/RELEASE.md).

## Contributing

Bug reports, ideas and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request. It covers setup, the project rules and the checks every change must pass.

## License

PDF Kagaz is licensed under the [Apache License 2.0](LICENSE).

It uses third-party open-source libraries under their own licenses; the app lists them in
Settings → Open-source licences. Google ML Kit, Firebase and the Google Mobile Ads SDK are
proprietary Google libraries covered by Google's own terms.
