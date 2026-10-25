import type { ViewProps } from 'react-native';

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

/**
 * How a PDF is locked: not encrypted (`none`), encrypted but the empty password allows changes
 * (`open`), a password is needed to open it (`password`), or it opens but forbids changes, so the
 * owner password is needed (`restricted`).
 */
export type PdfLock = 'none' | 'open' | 'password' | 'restricted';

/** A password opens the PDF with permission to change it (`ok`), does not open it, or only views it. */
export type PasswordCheck = 'ok' | 'wrong' | 'restricted';

/** A Compress level; the native side holds each level's image size and JPEG quality. */
export type CompressLevel = 'low' | 'medium' | 'high';

/** The compressed copy in the job workspace and how many images were replaced. */
export type CompressResult = { uri: string; sizeBytes: number; imagesRecompressed: number };

/** Page image format of PDF to images: JPEG (quality 90) or PNG. */
export type ImageFormat = 'jpg' | 'png';

/**
 * One page rendered into the job workspace (`file://` uri, `img-<page>.<ext>`); size in pixels.
 * `reduced`: rendered below the asked DPI to stay within the per-page pixel cap.
 */
export type RenderedPage = {
  uri: string;
  page: number;
  width: number;
  height: number;
  reduced: boolean;
};

/**
 * A page image saved to the gallery: its uri (MediaStore content://), final name, and the folder it
 * went to (`Pictures/PDFToolkit/<folder>` as cleaned and shortened natively).
 */
export type SavedImage = { uri: string; name: string; folder: string };

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

/** A saved signature PNG (`file://` in filesDir/signatures): trimmed, transparent, ≤ 1200 px wide. */
export type ExportedSignature = { uri: string; width: number; height: number };

/** Props of the native `SignaturePadView`; `onPadChange` fires when the pad becomes empty or not. */
export type SignaturePadViewProps = ViewProps & {
  /** `#rrggbb`. */
  inkColor: string;
  strokeWidthDp?: number;
  onPadChange?: (event: { nativeEvent: { empty: boolean } }) => void;
};

/** The view functions reachable through a ref to `SignaturePadView`. */
export type SignaturePadViewRef = {
  /** Null when nothing is drawn. */
  exportPng(): Promise<ExportedSignature | null>;
  clear(): Promise<void>;
};

/** Texts of a job's progress notification (localised by JS). */
export type JobNoticeTexts = { title: string; cancelLabel: string; channelName: string };

/** **Cancel** was pressed in the progress notification of `jobId`. */
export type JobCancelRequestEvent = { jobId: string };

/** A PDF shared to the app (ACTION_SEND) while it is running; `uri` is the shared stream. */
export type IncomingPdfEvent = { uri: string };

export type PdfNativeModuleEvents = {
  onScanProgress: (event: ScanProgressEvent) => void;
  onIncomingPdf: (event: IncomingPdfEvent) => void;
  onToolProgress: (event: ToolProgressEvent) => void;
  onJobCancelRequested: (event: JobCancelRequestEvent) => void;
};
