// react-native-mmkv imports react-native-nitro-modules at load time, which throws
// without the native TurboModule. MMKV swaps in its own in-memory mock under Jest,
// so a stub of the nitro entry point is all that is needed.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {},
}));

// The pdf-native Expo module has no native side under Jest; every test sees jest.fn fakes.
jest.mock('./modules/pdf-native', () => ({
  __esModule: true,
  default: require('./src/test-utils/fakePdfNative').createFakeNativeModule(),
}));
