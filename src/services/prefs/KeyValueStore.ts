/** Minimal synchronous key-value API; MMKV in the app, in-memory in tests. */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  getBoolean(key: string): boolean | undefined;
  getNumber(key: string): number | undefined;
  set(key: string, value: string | boolean | number): void;
  remove(key: string): void;
}
