# PDF Toolkit — project rules

Requirements: docs/REQUIREMENTS.md (feature IDs F-xx, V-xx, T-xx, A-xx).
Expo-specific guidance: AGENTS.md (check versioned Expo docs, don't trust memory).

## Stack

Expo SDK 57 (57.0.30, dev build, NOT Expo Go), New Architecture, target SDK 36, TypeScript strict, Expo Router, Zustand,
expo-sqlite + Drizzle, MMKV, FlashList, react-native-pdf 7.x, @cantoo/pdf-lib,
local Expo module `modules/pdf-native` (Kotlin, PdfBox-Android, PdfRenderer).

## Rules

- Screens never call pdf-lib or native code directly; use src/services/pdf/*.
- Storage access only through src/services/storage/StorageProvider.
- Every tool writes to a temp file, then moves to the output folder.
- Never overwrite the original unless the user chose "Replace original".
- All user-facing strings via i18next (src/i18n/en.json).
- Every service function gets a Jest test with a fixture PDF in `__fixtures__/`.
- Routes live in root app/ — never create src/app/.
- Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run format:check` before saying a task is done.
- Android only for now; do not add iOS-specific code.
- Install Expo/native packages with `npx expo install <pkg>`.

## Commands

```sh
npx expo run:android      # build + run dev client
npm test
npm run typecheck
npm run lint
npm run format:check
npx expo prebuild --clean # after changing native config
npx expo start            # once after route changes: regenerates .expo/types/router.d.ts for typecheck
```

## Local environment (macOS)

```sh
# JDK 17 required — JDK 24+ native-access warnings fail the RN CMake tasks; Android Studio's bundled JBR is JDK 25.
export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.20.1+1/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
```
