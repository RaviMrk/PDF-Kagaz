import type {
  PdfFileInfo,
  PdfNativeApi,
  PdfNativeErrorCode,
  ScanProgressEvent,
} from '../services/native/pdfNative';

type NativeFns = Omit<PdfNativeApi, 'addScanProgressListener'>;

function infoFromUri(uri: string, name?: string): PdfFileInfo {
  const slash = uri.lastIndexOf('/');
  const parentUri = slash > 0 ? uri.slice(0, slash) : uri;
  return {
    uri: name === undefined ? uri : `${parentUri}/${encodeURIComponent(name)}`,
    name: name ?? decodeURIComponent(uri.slice(slash + 1)),
    folder: '',
    parentUri,
    parentModifiedAt: 0,
    sizeBytes: 0,
    modifiedAt: 0,
  };
}

function createNativeFns(): jest.Mocked<NativeFns> {
  return {
    scanPdfs: jest.fn().mockResolvedValue({ files: [], scannedRoots: [], failedRoots: [] }),
    scanChangedFolders: jest.fn().mockResolvedValue([]),
    hasAllFilesAccess: jest.fn().mockResolvedValue(false),
    openAllFilesAccessSettings: jest.fn().mockResolvedValue(undefined),
    generateThumbnail: jest.fn().mockResolvedValue('file:///thumb.jpg'),
    getPageCount: jest.fn().mockResolvedValue(1),
    prepareReaderFile: jest.fn((uri: string) =>
      Promise.resolve({
        uri: uri.startsWith('file://') ? uri : 'file:///data/cache/reader/copy.pdf',
        copied: !uri.startsWith('file://'),
        sizeBytes: 1000,
      }),
    ),
    renderReaderThumbnail: jest.fn().mockResolvedValue('file:///reader-thumb.jpg'),
    releaseReaderDocument: jest.fn().mockResolvedValue(undefined),
    renameFile: jest.fn((uri: string, newName: string) =>
      Promise.resolve(infoFromUri(uri, newName)),
    ),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    duplicateFile: jest.fn((uri: string, _parentUri: string) => Promise.resolve(infoFromUri(uri))),
    moveToAppFolder: jest.fn((uri: string) => Promise.resolve(infoFromUri(uri))),
    pickFolder: jest.fn().mockResolvedValue(null),
    releaseFolder: jest.fn().mockResolvedValue(undefined),
    getPersistedFolderUris: jest.fn().mockResolvedValue([]),
  };
}

/** A fully mocked PdfNativeApi for service/store tests. */
export function createFakePdfNative(
  overrides: Partial<PdfNativeApi> = {},
): jest.Mocked<PdfNativeApi> {
  const fake: jest.Mocked<PdfNativeApi> = {
    ...createNativeFns(),
    addScanProgressListener: jest.fn((_cb: (e: ScanProgressEvent) => void) => ({
      remove: jest.fn(),
    })),
  };
  return Object.assign(fake, overrides);
}

/** The same fakes shaped like the raw native module (used by jest.setup.js). */
export function createFakeNativeModule() {
  return {
    ...createNativeFns(),
    addListener: jest.fn((_name: string, _cb: (...args: unknown[]) => void) => ({
      remove: jest.fn(),
    })),
  };
}

/** An Error carrying a native error `code`, like the ones expo-modules rejects with. */
export function nativeError(code: PdfNativeErrorCode, message: string = code): Error {
  return Object.assign(new Error(message), { code });
}
