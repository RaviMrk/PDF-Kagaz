import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT === 'play-saf' ? 'play-saf' : 'default';
  const allFilesAccess = variant === 'default';
  const blocked = config.android?.blockedPermissions ?? [];

  return {
    ...config,
    name: config.name ?? 'PDF Toolkit',
    slug: config.slug ?? 'pdf-toolkit',
    android: {
      ...config.android,
      blockedPermissions: allFilesAccess
        ? blocked
        : [...blocked, 'android.permission.MANAGE_EXTERNAL_STORAGE'],
    },
    plugins: [...(config.plugins ?? []), ['./plugins/withStoragePermissions', { allFilesAccess }]],
    extra: {
      ...config.extra,
      appVariant: variant,
      allFilesAccessEnabled: allFilesAccess,
    },
  };
};
