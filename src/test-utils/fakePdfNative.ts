import type {
  CompressLevel,
  ImageFilter,
  ImageFormat,
  IncomingPdfEvent,
  JobCancelRequestEvent,
  PdfFileInfo,
  PdfNativeApi,
  PdfNativeErrorCode,
  ScanProgressEvent,
  ToolProgressEvent,
} from '../services/native/pdfNative';

type NativeFns = Omit<
  PdfNativeApi,
  | 'addScanProgressListener'
  | 'addIncomingPdfListener'
  | 'addToolProgressListener'
  | 'addJobCancelRequestListener'
>;

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
    clearCaches: jest.fn().mockResolvedValue(0),
    disableCrashlyticsNow: jest.fn(() => false),
    renameFile: jest.fn((uri: string, newName: string) =>
      Promise.resolve(infoFromUri(uri, newName)),
    ),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    duplicateFile: jest.fn((uri: string, _parentUri: string) => Promise.resolve(infoFromUri(uri))),
    moveToAppFolder: jest.fn((uri: string) => Promise.resolve(infoFromUri(uri))),
    pickFolder: jest.fn().mockResolvedValue(null),
    releaseFolder: jest.fn().mockResolvedValue(undefined),
    getPersistedFolderUris: jest.fn().mockResolvedValue([]),
    sharePdf: jest.fn().mockResolvedValue(undefined),
    openPdfWith: jest.fn().mockResolvedValue(undefined),
    printPdf: jest.fn().mockResolvedValue(undefined),
    takeIncomingPdf: jest.fn().mockResolvedValue(null),
    resolveIncomingPdf: jest.fn((uri: string) => Promise.resolve(infoFromUri(uri))),
    releaseIncomingGrant: jest.fn().mockResolvedValue(undefined),
    createToolWorkspace: jest.fn((id: string) => Promise.resolve(`file:///data/cache/tools/${id}`)),
    stageToolInput: jest.fn((_uri: string, id: string, i: number, _maxBytes: number) =>
      Promise.resolve({ uri: `file:///data/cache/tools/${id}/in-${i}.pdf`, sizeBytes: 1000 }),
    ),
    importImage: jest.fn((_uri: string, _session: string, index: number, _maxBytes: number) =>
      Promise.resolve({ index, width: 400, height: 300, sizeBytes: 1000 }),
    ),
    prepareImagePage: jest.fn(
      (
        _session: string,
        _source: number,
        jobId: string,
        page: number,
        _maxLongSide: number,
        _quality: number,
        _filter: ImageFilter,
      ) =>
        Promise.resolve({
          uri: `file:///data/cache/tools/${jobId}/page-${page}.jpg`,
          width: 400,
          height: 300,
          sizeBytes: 1000,
        }),
    ),
    renderImageThumbnail: jest.fn(
      (session: string, index: number, _width: number, _filter: ImageFilter) =>
        Promise.resolve(`file:///tool-thumbs/${session}-${index}.jpg`),
    ),
    publishToolOutput: jest.fn((_temp: string, name: string) =>
      Promise.resolve({
        uri: 'file:///storage/emulated/0/Documents/PDFToolkit/' + encodeURIComponent(name),
        name,
        folder: 'Documents/PDFToolkit',
        parentUri: 'file:///storage/emulated/0/Documents/PDFToolkit',
        parentModifiedAt: 0,
        sizeBytes: 1000,
        modifiedAt: 0,
      }),
    ),
    cancelNativeTool: jest.fn().mockResolvedValue(undefined),
    startJobNotice: jest.fn().mockResolvedValue(true),
    updateJobNotice: jest.fn().mockResolvedValue(undefined),
    stopJobNotice: jest.fn().mockResolvedValue(undefined),
    postJobDoneNotice: jest.fn().mockResolvedValue(true),
    cleanToolWorkspace: jest.fn().mockResolvedValue(undefined),
    cleanupToolLeftovers: jest.fn().mockResolvedValue(0),
    inspectPdf: jest.fn().mockResolvedValue('none'),
    checkPdfPassword: jest.fn().mockResolvedValue('ok'),
    unlockToolInput: jest.fn((_uri: string, id: string, i: number, _password: string | null) =>
      Promise.resolve({ uri: `file:///data/cache/tools/${id}/in-${i}.open.pdf`, sizeBytes: 1000 }),
    ),
    assemblePdf: jest.fn(
      (jobId: string, _inputUris: string[], outputsJson: string, firstOutput: number) =>
        Promise.resolve(
          (JSON.parse(outputsJson) as unknown[]).map((_, k) => ({
            uri: `file:///data/cache/tools/${jobId}/out-native-${firstOutput + k}.pdf`,
            sizeBytes: 1000,
          })),
        ),
    ),
    compressPdf: jest.fn((_uri: string, jobId: string, _level: CompressLevel) =>
      Promise.resolve({
        uri: `file:///data/cache/tools/${jobId}/out-compressed.pdf`,
        sizeBytes: 600,
        imagesRecompressed: 1,
      }),
    ),
    protectPdf: jest.fn((_uri: string, jobId: string, _password: string) =>
      Promise.resolve({
        uri: `file:///data/cache/tools/${jobId}/out-protected.pdf`,
        sizeBytes: 900,
      }),
    ),
    renderPdfPage: jest.fn(
      (_uri: string, jobId: string, page: number, _dpi: number, format: ImageFormat) =>
        Promise.resolve({
          uri: `file:///data/cache/tools/${jobId}/img-${page}.${format}`,
          page,
          width: 1240,
          height: 1754,
          reduced: false,
        }),
    ),
    releasePageExport: jest.fn().mockResolvedValue(undefined),
    stampPdf: jest.fn((_uri: string, jobId: string, _specJson: string) =>
      Promise.resolve({
        uri: `file:///data/cache/tools/${jobId}/out-stamped.pdf`,
        sizeBytes: 1200,
      }),
    ),
    renderTextStamp: jest.fn((jobId: string, _text: string, _color: number, heightPx: number) =>
      Promise.resolve({
        uri: `file:///data/cache/tools/${jobId}/stamp-text.png`,
        width: heightPx * 4,
        height: heightPx,
        sizeBytes: 2000,
      }),
    ),
    prepareStampImage: jest.fn(
      (_session: string, sourceIndex: number, jobId: string, _maxLongSide: number) =>
        Promise.resolve({
          uri: `file:///data/cache/tools/${jobId}/stamp-image-${sourceIndex}.png`,
          width: 200,
          height: 100,
          sizeBytes: 2000,
        }),
    ),
    publishImageOutput: jest.fn((_temp: string, name: string, folder: string) =>
      Promise.resolve({
        uri: `content://media/external/images/media/${name.length}`,
        name,
        folder: `Pictures/PDFToolkit/${folder}`,
      }),
    ),
    deleteSignatureFile: jest.fn().mockResolvedValue(undefined),
    shareImages: jest.fn().mockResolvedValue(undefined),
    viewImage: jest.fn().mockResolvedValue(undefined),
    renderToolThumbnail: jest.fn().mockResolvedValue('file:///tool-thumb.jpg'),
    getToolPageCount: jest.fn().mockResolvedValue(3),
    releaseToolDocument: jest.fn().mockResolvedValue(undefined),
    saveCopyAs: jest.fn().mockResolvedValue(true),
    pickPdfDocuments: jest.fn().mockResolvedValue([]),
    pickImages: jest.fn().mockResolvedValue({ uris: [], dropped: 0 }),
    scanDocument: jest.fn().mockResolvedValue([]),
  };
}

export type FakePdfNative = jest.Mocked<PdfNativeApi> & {
  /** Delivers `e` to every subscribed tool progress listener. */
  emitToolProgress(e: ToolProgressEvent): void;
  /** Delivers `e` to every subscribed job cancel request listener (notification **Cancel**). */
  emitJobCancelRequest(e: JobCancelRequestEvent): void;
};

/** A fully mocked PdfNativeApi for service/store tests. */
export function createFakePdfNative(overrides: Partial<PdfNativeApi> = {}): FakePdfNative {
  const progressListeners = new Set<(e: ToolProgressEvent) => void>();
  const cancelListeners = new Set<(e: JobCancelRequestEvent) => void>();
  const fake: FakePdfNative = {
    ...createNativeFns(),
    addScanProgressListener: jest.fn((_cb: (e: ScanProgressEvent) => void) => ({
      remove: jest.fn(),
    })),
    addIncomingPdfListener: jest.fn((_cb: (e: IncomingPdfEvent) => void) => ({
      remove: jest.fn(),
    })),
    addToolProgressListener: jest.fn((cb: (e: ToolProgressEvent) => void) => {
      progressListeners.add(cb);
      return { remove: jest.fn(() => progressListeners.delete(cb)) };
    }),
    emitToolProgress: (e) => progressListeners.forEach((cb) => cb(e)),
    addJobCancelRequestListener: jest.fn((cb: (e: JobCancelRequestEvent) => void) => {
      cancelListeners.add(cb);
      return { remove: jest.fn(() => cancelListeners.delete(cb)) };
    }),
    emitJobCancelRequest: (e) => cancelListeners.forEach((cb) => cb(e)),
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
