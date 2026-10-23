/** Android libraries in the release build (./gradlew :app:dependencies, releaseRuntimeClasspath). */
export const NATIVE_NOTICES: { name: string; license: string }[] = [
  { name: 'AndroidX', license: 'Apache-2.0' },
  { name: 'Google Play services', license: 'Google APIs Terms of Service' },
  { name: 'ML Kit', license: 'Google APIs Terms of Service' },
  { name: 'Google Mobile Ads SDK', license: 'Google APIs Terms of Service' },
  { name: 'User Messaging Platform (UMP)', license: 'Google APIs Terms of Service' },
  { name: 'PdfiumAndroid (react-native-pdf)', license: 'Apache-2.0' },
  { name: 'MMKV', license: 'BSD-3-Clause' },
  { name: 'Hermes', license: 'MIT' },
  { name: 'React Native', license: 'MIT' },
  { name: 'Kotlin', license: 'Apache-2.0' },
];
