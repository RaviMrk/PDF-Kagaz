import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** Installed version and build number; the config values apply where the native ones are absent. */
export function appVersion(): { version: string; build: string } {
  return {
    version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0',
    build: Application.nativeBuildVersion ?? '0',
  };
}

/** The privacy policy URL from config: https only, otherwise null. */
export function privacyPolicyUrl(): string | null {
  const url: unknown = Constants.expoConfig?.extra?.privacyPolicyUrl;
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
