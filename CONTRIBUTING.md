# Contributing to PDF Kagaz

Thanks for helping out. This guide covers what you need to get a change merged.

## Reporting bugs and asking for features

Open a GitHub issue. For a bug, include:

- your phone model and Android version
- the steps that cause the problem, and what you expected to happen
- a sample PDF if the bug depends on the file (only one you're happy to share publicly)

Report security problems privately, not in a public issue. Use GitHub's **Report a
vulnerability** button on the repository's Security tab.

## Setting up

Follow [Getting started](README.md#getting-started) in the README. In short: Node 20.19.4+, JDK 17 and
the Android SDK, then `npm install` and `npx expo run:android`.

## Project rules

These keep the app safe for people's files. Pull requests that break them will be asked to
change.

- **Screens never call pdf-lib or native code directly.** Go through `src/services/pdf/*`.
- **Storage goes only through `src/services/storage/StorageProvider`.**
- **Every tool writes to a temporary file, then moves it to the output folder.**
- **Never overwrite the original** unless the user chose "Replace original".
- **Everything stays on the device.** Don't add code that uploads files or sends file names or
  content anywhere.
- **All user-facing text goes through i18next.** Add keys to `src/i18n/en.json`.
- **Every service function gets a Jest test** that uses a fixture PDF from `__fixtures__/`.
- **Routes live in the root `app/` folder.** Never create `src/app/`.
- **Android only for now.** Don't add iOS-specific code.
- **Install Expo and native packages with `npx expo install <pkg>`** so the versions match the
  SDK.

For native work in `modules/pdf-native` (Kotlin), add Robolectric tests next to the existing
ones.

## Before you open a pull request

Run all four checks. They must pass:

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
```

If you changed Kotlin code, also run:

```sh
cd android && ./gradlew :pdf-native:testDebugUnitTest
```

Then:

1. Keep each pull request to one change, and explain what it does and why.
2. For UI changes, add a screenshot or short screen recording.
3. Say which device or emulator you tested on.

## Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) style already used in the
history, with a scope where it helps:

```text
feat(tools): add page range to watermark
fix(pdf-native): keep spaces between OCR words
docs(readme): explain the play-saf build
```

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
