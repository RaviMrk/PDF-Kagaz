import Constants from 'expo-constants';

/** False only in the play-saf build variant (no MANAGE_EXTERNAL_STORAGE). */
export function allFilesAccessEnabled(): boolean {
  return Constants.expoConfig?.extra?.allFilesAccessEnabled !== false;
}
