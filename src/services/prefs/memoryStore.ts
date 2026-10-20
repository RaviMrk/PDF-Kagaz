import type { KeyValueStore } from './KeyValueStore';

export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string | boolean | number>();
  return {
    getString: (key) => {
      const v = data.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getBoolean: (key) => {
      const v = data.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}
