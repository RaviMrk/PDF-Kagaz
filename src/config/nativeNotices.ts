/**
 * Android libraries in the release build. Derived from
 * `cd android && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath`
 * (groups merged by publisher; licences from each project's published POM or repository).
 * Firebase Crashlytics and Analytics are linked only when google-services.json is supplied.
 */
export const NATIVE_NOTICES: { name: string; license: string }[] = [
  { name: 'AndroidX and Jetpack Compose', license: 'Apache-2.0' },
  { name: 'Material Components for Android', license: 'Apache-2.0' },
  { name: 'Kotlin standard library and kotlinx.coroutines', license: 'Apache-2.0' },
  { name: 'OkHttp, Okio and zstd-kmp', license: 'Apache-2.0' },
  { name: 'Fresco, SoLoader, Yoga and fbjni', license: 'MIT' },
  { name: 'Hermes and React Native', license: 'MIT' },
  { name: 'Glide, Glide transformations and AndroidSVG', license: 'BSD-2-Clause, MIT, Apache-2.0' },
  {
    name: 'Android animation decoders (APNG, GIF, WebP) and AVIF',
    license: 'Apache-2.0, BSD-2-Clause',
  },
  { name: 'Guava, Gson, Apache Commons, javax.inject, error-prone, j2objc', license: 'Apache-2.0' },
  { name: 'Checker Framework annotations and Brotli decoder', license: 'MIT' },
  { name: 'Bolts', license: 'BSD-3-Clause' },
  { name: 'PdfiumAndroid (react-native-pdf)', license: 'Apache-2.0' },
  { name: 'MMKV', license: 'BSD-3-Clause' },
  { name: 'react-native-blob-util (Android)', license: 'MIT' },
  { name: 'Google Play services and ML Kit', license: 'Google APIs Terms of Service' },
  { name: 'Google Mobile Ads SDK', license: 'Google APIs Terms of Service' },
  { name: 'User Messaging Platform (UMP)', license: 'Google APIs Terms of Service' },
  { name: 'Firebase components (with the ads SDK)', license: 'Apache-2.0' },
  {
    name: 'Firebase Crashlytics and Analytics (when enabled)',
    license: 'Firebase Terms of Service',
  },
];
