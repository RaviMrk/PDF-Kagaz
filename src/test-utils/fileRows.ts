import type { FileRow } from '@/db/schema';

export function makeRow(over: Partial<FileRow> & { name: string }): FileRow {
  return {
    id: `id-${over.name}`,
    uri: `file:///storage/emulated/0/Download/${over.name}`,
    folder: 'Download',
    parentUri: 'file:///storage/emulated/0/Download',
    sizeBytes: 2048,
    modifiedAt: Date.UTC(2026, 0, 15),
    pageCount: 3,
    thumbPath: null,
    isEncrypted: false,
    isCorrupt: false,
    isFavorite: false,
    lastPage: null,
    lastOpenedAt: null,
    source: 'scan',
    ...over,
  };
}
