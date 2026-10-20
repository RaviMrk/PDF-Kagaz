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

export type PickedFolder = { uri: string; label: string };

export type PdfNativeModuleEvents = {
  onScanProgress: (event: ScanProgressEvent) => void;
};
