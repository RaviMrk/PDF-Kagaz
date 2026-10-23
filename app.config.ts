import type { ConfigContext, ExpoConfig } from 'expo/config';

import { googleServicesPath, isFirebaseEnabled } from './firebaseConfig';

type IntentFilter = NonNullable<NonNullable<ExpoConfig['android']>['intentFilters']>[number];

/** "Open with" (VIEW) and share target (SEND) for PDFs. */
export const PDF_INTENT_FILTERS: IntentFilter[] = [
  { action: 'VIEW', category: ['DEFAULT'], data: [{ mimeType: 'application/pdf' }] },
  { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'application/pdf' }] },
];

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT === 'play-saf' ? 'play-saf' : 'default';
  const allFilesAccess = variant === 'default';
  const blocked = config.android?.blockedPermissions ?? [];
  // Crashlytics and Analytics only when the user's google-services.json exists.
  const firebaseEnabled = isFirebaseEnabled();

  return {
    ...config,
    name: config.name ?? 'PDF Toolkit',
    slug: config.slug ?? 'pdf-toolkit',
    android: {
      ...config.android,
      intentFilters: [...(config.android?.intentFilters ?? []), ...PDF_INTENT_FILTERS],
      blockedPermissions: allFilesAccess
        ? blocked
        : [...blocked, 'android.permission.MANAGE_EXTERNAL_STORAGE'],
      ...(firebaseEnabled ? { googleServicesFile: googleServicesPath() } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ['./plugins/withStoragePermissions', { allFilesAccess }],
      './plugins/withPdfIntentFilters',
      ...(firebaseEnabled
        ? ['@react-native-firebase/app', '@react-native-firebase/crashlytics']
        : []),
    ],
    extra: {
      ...config.extra,
      appVariant: variant,
      allFilesAccessEnabled: allFilesAccess,
      firebaseEnabled,
    },
  };
};
