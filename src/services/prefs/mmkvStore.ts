import { createMMKV } from 'react-native-mmkv';

import type { KeyValueStore } from './KeyValueStore';

const mmkv = createMMKV({ id: 'prefs' });

export const mmkvStore: KeyValueStore = {
  getString: (key) => mmkv.getString(key),
  getBoolean: (key) => mmkv.getBoolean(key),
  getNumber: (key) => mmkv.getNumber(key),
  set: (key, value) => mmkv.set(key, value),
  remove: (key) => {
    mmkv.remove(key);
  },
};
