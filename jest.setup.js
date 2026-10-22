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

// @shopify/flash-list/jestSetup (2.0.2) swaps FlashList for `RecyclerView`, which the package no
// longer exports (undefined component). FlashList v2 is the recycler itself, so only the layout
// measurement mocks from that file are kept.
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => ({
  ...jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout'),
  measureParentSize: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureFirstChildLayout: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureItemLayout: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
}));

// react-native-pdf is a native Fabric view; tests drive its callbacks through the fake's recorded props.
jest.mock('react-native-pdf', () => require('./src/test-utils/fakePdf'));

// react-native-sortables needs Reanimated worklets and gesture handling that do not run under Jest.
jest.mock('react-native-sortables', () => require('./src/test-utils/fakeSortables'));

// Reanimated and Worklets need their native runtime; under Jest both use the packages' own mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
