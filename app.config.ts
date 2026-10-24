import type { ConfigContext, ExpoConfig } from 'expo/config';

import { googleServicesPath, isFirebaseEnabled } from './firebaseConfig';
import { resolveAdsConfig } from './src/config/adsIds';

type IntentFilter = NonNullable<NonNullable<ExpoConfig['android']>['intentFilters']>[number];

/** "Open with" (VIEW) and share target (SEND) for PDFs. */
export const PDF_INTENT_FILTERS: IntentFilter[] = [
  { action: 'VIEW', category: ['DEFAULT'], data: [{ mimeType: 'application/pdf' }] },
  { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'application/pdf' }] },
];

const PRIVACY_POLICY_ERROR = 'Production build needs PRIVACY_POLICY_URL set to an https:// URL';

/** Optional outside production; a production build must link a live https policy page. */
export function resolvePrivacyPolicyUrl(env: Record<string, string | undefined>): string | null {
  const url = env.PRIVACY_POLICY_URL?.trim() || null;
  if (env.APP_ENV !== 'production') return url;
  if (url === null || !/^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/.test(url)) {
    throw new Error(PRIVACY_POLICY_ERROR);
  }
  return url;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT === 'play-saf' ? 'play-saf' : 'default';
  const allFilesAccess = variant === 'default';
  const blocked = config.android?.blockedPermissions ?? [];
  // Crashlytics and Analytics only when the user's google-services.json exists.
  const firebaseEnabled = isFirebaseEnabled();
  // Google's test IDs unless APP_ENV=production; throws when production lacks real IDs.
  const ads = resolveAdsConfig(process.env);
  // Throws in production when the privacy policy URL is missing or not https.
  const privacyPolicyUrl = resolvePrivacyPolicyUrl(process.env);

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
      './plugins/withBackupRules',
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: ads.appId,
          delayAppMeasurementInit: true,
          optimizeInitialization: true,
          optimizeAdLoading: true,
        },
      ],
      ...(firebaseEnabled
        ? ['@react-native-firebase/app', '@react-native-firebase/crashlytics']
        : []),
    ],
    extra: {
      ...config.extra,
      appVariant: variant,
      allFilesAccessEnabled: allFilesAccess,
      firebaseEnabled,
      privacyPolicyUrl,
      ads: {
        banner: ads.banner,
        interstitial: ads.interstitial,
        debugGeography: ads.debugGeography,
        testDeviceIds: ads.testDeviceIds,
      },
    },
  };
};
