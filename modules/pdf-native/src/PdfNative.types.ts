/**
 * A PDF found on the device. `uri` is a percent-encoded `file://` URI (full access) or a
 * tree-based document URI (SAF). `folder` is the display folder; times are epoch ms.
 */
export type PdfFileInfo = {
  uri: string;
  name: string;
  folder: string;
  parentUri: string;
  parentModifiedAt: number;
  sizeBytes: number;
  modifiedAt: number;
};

/** Roots use the same URI form as file uris, without a trailing slash. */
export type ScanResult = { files: PdfFileInfo[]; scannedRoots: string[]; failedRoots: string[] };

export type FolderStamp = { uri: string; modifiedAt: number };

export type FolderChange = {
  uri: string;
  exists: boolean;
  modifiedAt: number;
  files: PdfFileInfo[];
};

export type ScanProgressEvent = { scannedFolders: number; found: number };

/**
 * What the reader opens. `uri` is always a percent-encoded `file://` URI (`Uri.fromFile`): the
 * source itself (`copied: false`) or a cache copy of a `content://` source (`copied: true`).
 */
export type ReaderFile = { uri: string; copied: boolean; sizeBytes: number };

/**
 * A file in a private tool job workspace: `uri` is a percent-encoded `file://` URI in
 * `cacheDir/tools/<jobId>/`; `sizeBytes` is its size in bytes.
 */
export type WorkspaceFile = { uri: string; sizeBytes: number };

/** A tool input copied into the job workspace; `sizeBytes` is the number of bytes copied. */
export type StagedInput = WorkspaceFile;

/** Progress of a native tool job, 0..1; throttled to one event per 100 ms, plus one at 1. */
export type ToolProgressEvent = { jobId: string; fraction: number };

/** Colour filter of an image page: as scanned, greyscale, or high-contrast black and white. */
export type ImageFilter = 'colour' | 'greyscale' | 'bw';

/** A source copied into an image session; width and height are display-oriented (after EXIF). */
export type ImportedImage = { index: number; width: number; height: number; sizeBytes: number };

/** A prepared page JPEG in a job workspace (`file://` uri); size is in pixels, upright. */
export type PreparedPage = { uri: string; width: number; height: number; sizeBytes: number };

/** Photo picker result: the picks kept (at most the requested max) and how many over it were dropped. */
export type PickedImageUris = { uris: string[]; dropped: number };

export type PickedFolder = { uri: string; label: string };

/** A PDF shared to the app (ACTION_SEND) while it is running; `uri` is the shared stream. */
export type IncomingPdfEvent = { uri: string };

export type PdfNativeModuleEvents = {
  onScanProgress: (event: ScanProgressEvent) => void;
  onIncomingPdf: (event: IncomingPdfEvent) => void;
  onToolProgress: (event: ToolProgressEvent) => void;
};
