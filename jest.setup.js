// react-native-mmkv imports react-native-nitro-modules at load time, which throws
// without the native TurboModule. MMKV swaps in its own in-memory mock under Jest,
// so a stub of the nitro entry point is all that is needed.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {},
}));
