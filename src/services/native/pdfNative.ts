import PdfNative from '../../../modules/pdf-native';
import type {
  FolderChange,
  FolderStamp,
  IncomingPdfEvent,
  PdfFileInfo,
  PickedFolder,
  ReaderFile,
  ScanProgressEvent,
  ScanResult,
} from '../../../modules/pdf-native';

export type {
  FolderChange,
  FolderStamp,
  IncomingPdfEvent,
  PdfFileInfo,
  PickedFolder,
  ReaderFile,
  ScanProgressEvent,
  ScanResult,
} from '../../../modules/pdf-native';

export interface PdfNativeApi {
  scanPdfs(roots?: string[] | null): Promise<ScanResult>;
  scanChangedFolders(known: FolderStamp[]): Promise<FolderChange[]>;
  hasAllFilesAccess(): Promise<boolean>;
  openAllFilesAccessSettings(): Promise<void>;
  generateThumbnail(uri: string, page: number, width: number): Promise<string>;
  getPageCount(uri: string, password?: string | null): Promise<number>;
  /** A percent-encoded file:// URI the viewer can open: the file itself or a cache copy of a content:// source. */
  prepareReaderFile(uri: string): Promise<ReaderFile>;
  /** Reader page thumbnails, on a lane separate from the Files-list generateThumbnail jobs. */
  renderReaderThumbnail(fileUri: string, page: number, width: number): Promise<string>;
  /** Closes the document kept open for reader thumbnails. */
  releaseReaderDocument(): Promise<void>;
  renameFile(uri: string, newName: string): Promise<PdfFileInfo>;
  deleteFile(uri: string): Promise<void>;
  duplicateFile(uri: string, parentUri: string): Promise<PdfFileInfo>;
  moveToAppFolder(uri: string): Promise<PdfFileInfo>;
  pickFolder(): Promise<PickedFolder | null>;
  releaseFolder(uri: string): Promise<void>;
  getPersistedFolderUris(): Promise<string[]>;
  /** Share sheet for a PDF (file:// through the app's FileProvider, content:// as is); this app is excluded. */
  sharePdf(uri: string, chooserTitle: string): Promise<void>;
  /** "Open with" chooser (ACTION_VIEW) for a PDF; this app is excluded. */
  openPdfWith(uri: string, chooserTitle: string): Promise<void>;
  /** Hands the PDF to the Android print service. */
  printPdf(uri: string, jobName: string): Promise<void>;
  /** The PDF shared to the app at launch (ACTION_SEND), consumed so it is returned once; else null. */
  takeIncomingPdf(): Promise<string | null>;
  /** File info for a shared/opened PDF; content:// rows get folder "" and parentUri "". */
  resolveIncomingPdf(uri: string): Promise<PdfFileInfo>;
  /** Releases the persisted read grant taken for an incoming document (call when its row is removed). */
  releaseIncomingGrant(uri: string): Promise<void>;
  addScanProgressListener(cb: (e: ScanProgressEvent) => void): { remove(): void };
  /** PDFs shared to the app while it is running (ACTION_VIEW is left to Linking). */
  addIncomingPdfListener(cb: (e: IncomingPdfEvent) => void): { remove(): void };
}

export const PDF_NATIVE_ERROR_CODES = [
  'ERR_FILE_NOT_FOUND',
  'ERR_PDF_ENCRYPTED',
  'ERR_PDF_INVALID',
  'ERR_PERMISSION_DENIED',
  'ERR_FILE_EXISTS',
  'ERR_INVALID_NAME',
  'ERR_PASSWORD_UNSUPPORTED',
  'ERR_NO_ACTIVITY',
  'ERR_IO',
  'ERR_VOLUME_UNAVAILABLE',
] as const;

export type PdfNativeErrorCode = (typeof PDF_NATIVE_ERROR_CODES)[number];

export function isPdfNativeError(
  e: unknown,
  code?: PdfNativeErrorCode,
): e is Error & { code: PdfNativeErrorCode } {
  if (!(e instanceof Error) || !('code' in e)) return false;
  const actual = (e as { code: unknown }).code;
  if (!(PDF_NATIVE_ERROR_CODES as readonly unknown[]).includes(actual)) return false;
  return code === undefined || actual === code;
}

/** The only JS entry point to the pdf-native module (screens go through services, never here). */
export const pdfNative: PdfNativeApi = {
  scanPdfs: (roots) => PdfNative.scanPdfs(roots),
  // Two primitive arrays instead of Record objects: expo converts Records with kotlin-reflect,
  // which costs seconds on the first call of a process.
  scanChangedFolders: (known) =>
    PdfNative.scanChangedFolders(
      known.map((k) => k.uri),
      known.map((k) => k.modifiedAt),
    ),
  hasAllFilesAccess: () => PdfNative.hasAllFilesAccess(),
  openAllFilesAccessSettings: () => PdfNative.openAllFilesAccessSettings(),
  generateThumbnail: (uri, page, width) => PdfNative.generateThumbnail(uri, page, width),
  getPageCount: (uri, password) => PdfNative.getPageCount(uri, password),
  prepareReaderFile: (uri) => PdfNative.prepareReaderFile(uri),
  renderReaderThumbnail: (fileUri, page, width) =>
    PdfNative.renderReaderThumbnail(fileUri, page, width),
  releaseReaderDocument: () => PdfNative.releaseReaderDocument(),
  renameFile: (uri, newName) => PdfNative.renameFile(uri, newName),
  deleteFile: (uri) => PdfNative.deleteFile(uri),
  duplicateFile: (uri, parentUri) => PdfNative.duplicateFile(uri, parentUri),
  moveToAppFolder: (uri) => PdfNative.moveToAppFolder(uri),
  pickFolder: () => PdfNative.pickFolder(),
  releaseFolder: (uri) => PdfNative.releaseFolder(uri),
  getPersistedFolderUris: () => PdfNative.getPersistedFolderUris(),
  sharePdf: (uri, chooserTitle) => PdfNative.sharePdf(uri, chooserTitle),
  openPdfWith: (uri, chooserTitle) => PdfNative.openPdfWith(uri, chooserTitle),
  printPdf: (uri, jobName) => PdfNative.printPdf(uri, jobName),
  takeIncomingPdf: () => PdfNative.takeIncomingPdf(),
  resolveIncomingPdf: (uri) => PdfNative.resolveIncomingPdf(uri),
  releaseIncomingGrant: (uri) => PdfNative.releaseIncomingGrant(uri),
  addScanProgressListener: (cb) => PdfNative.addListener('onScanProgress', cb),
  addIncomingPdfListener: (cb) => PdfNative.addListener('onIncomingPdf', cb),
};
