import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import {
  files,
  folderStamps,
  scanRoots,
  bookmarks,
  type FileRow,
  type NewFileRow,
  type ScanRootRow,
} from '@/db/schema';
import type {
  FolderChange,
  FolderStamp,
  PdfFileInfo,
  ScanResult,
} from '@/services/native/pdfNative';
import { fileIdForUri } from '@/utils/fileId';

/** Accepts both ExpoSQLiteDatabase (app) and BetterSQLite3Database (tests). */
// Run result type differs per driver and `.changes` is read; `unknown` makes it unusable.
export type IndexDb = BaseSQLiteDatabase<'sync', any>;

export type ScanDiff = { added: number; updated: number; removed: number };

const INSERT_CHUNK = 50;
const LOOKUP_CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function isUnderRoot(uri: string, root: string): boolean {
  return uri.startsWith(`${root}/`);
}

export function listFiles(db: IndexDb): FileRow[] {
  return db.select().from(files).all();
}

function toRow(info: PdfFileInfo, source: FileRow['source']): NewFileRow {
  return {
    id: fileIdForUri(info.uri),
    uri: info.uri,
    name: info.name,
    folder: info.folder,
    parentUri: info.parentUri,
    sizeBytes: info.sizeBytes,
    modifiedAt: info.modifiedAt,
    source,
  };
}

/**
 * Upserts rows; only writes rows that are new or differ. Returns added/updated counts.
 * Conflict update touches only name/folder/parentUri/size/modifiedAt and resets
 * thumb data (incl. encrypted/corrupt flags) when the file content (size or mtime) changed.
 * An empty native parentUri/folder (SAF rename on API 24-25) keeps the old value.
 */
function upsertMany(db: IndexDb, infos: PdfFileInfo[], source: FileRow['source'], promote = false) {
  const byId = new Map<string, NewFileRow>();
  for (const info of infos) byId.set(fileIdForUri(info.uri), toRow(info, source));
  const incoming = [...byId.values()];

  const existing = new Map<string, FileRow>();
  for (const part of chunks(incoming, LOOKUP_CHUNK)) {
    const ids = part.map((r) => r.id as string);
    for (const row of db.select().from(files).where(inArray(files.id, ids)).all()) {
      existing.set(row.id, row);
    }
  }

  const toWrite: NewFileRow[] = [];
  let added = 0;
  let updated = 0;
  for (const row of incoming) {
    const old = existing.get(row.id as string);
    if (!old) {
      added++;
      toWrite.push(row);
      continue;
    }
    const parentUri = row.parentUri === '' ? old.parentUri : row.parentUri;
    const folder = row.folder === '' ? old.folder : row.folder;
    if (
      old.name !== row.name ||
      old.folder !== folder ||
      old.parentUri !== parentUri ||
      old.sizeBytes !== row.sizeBytes ||
      old.modifiedAt !== row.modifiedAt ||
      (promote && old.source !== row.source)
    ) {
      updated++;
      toWrite.push(row);
    }
  }

  const changed = sql`(${files.sizeBytes} != excluded.size_bytes OR ${files.modifiedAt} != excluded.modified_at)`;
  for (const part of chunks(toWrite, INSERT_CHUNK)) {
    db.insert(files)
      .values(part)
      .onConflictDoUpdate({
        target: files.id,
        set: {
          name: sql`excluded.name`,
          folder: sql`CASE WHEN excluded.folder = '' THEN ${files.folder} ELSE excluded.folder END`,
          parentUri: sql`CASE WHEN excluded.parent_uri = '' THEN ${files.parentUri} ELSE excluded.parent_uri END`,
          sizeBytes: sql`excluded.size_bytes`,
          modifiedAt: sql`excluded.modified_at`,
          thumbPath: sql`CASE WHEN ${changed} THEN NULL ELSE ${files.thumbPath} END`,
          pageCount: sql`CASE WHEN ${changed} THEN NULL ELSE ${files.pageCount} END`,
          isEncrypted: sql`CASE WHEN ${changed} THEN 0 ELSE ${files.isEncrypted} END`,
          isCorrupt: sql`CASE WHEN ${changed} THEN 0 ELSE ${files.isCorrupt} END`,
          ...(promote ? { source: sql`excluded.source` } : {}),
        },
      })
      .run();
  }
  return { added, updated, keepIds: [...byId.keys()] };
}

function deleteIds(db: IndexDb, ids: string[]): void {
  for (const part of chunks(ids, LOOKUP_CHUNK)) {
    db.delete(files).where(inArray(files.id, part)).run();
  }
}

export function applyScan(
  db: IndexDb,
  input: { result: ScanResult; source: 'scan' | 'saf' },
): ScanDiff {
  const { result, source } = input;
  return db.transaction((tx) => {
    const { added, updated, keepIds } = upsertMany(tx, result.files, source);
    const keep = new Set(keepIds);
    const roots = result.scannedRoots.filter(
      (r) => !result.failedRoots.some((f) => f === r || isUnderRoot(r, f)),
    );
    const stale = tx
      .select({ id: files.id, uri: files.uri })
      .from(files)
      .where(eq(files.source, source))
      .all()
      .filter(
        (row) =>
          !keep.has(row.id) &&
          roots.some((r) => isUnderRoot(row.uri, r)) &&
          !result.failedRoots.some((f) => isUnderRoot(row.uri, f)),
      )
      .map((row) => row.id);
    deleteIds(tx, stale);

    if (source === 'scan') {
      tx.delete(folderStamps).run();
      const stamps = new Map<string, number>();
      for (const f of result.files) stamps.set(f.parentUri, f.parentModifiedAt);
      const rows = [...stamps].map(([uri, modifiedAt]) => ({ uri, modifiedAt }));
      for (const part of chunks(rows, INSERT_CHUNK * 2)) {
        tx.insert(folderStamps).values(part).run();
      }
    }
    return { added, updated, removed: stale.length };
  });
}

export function applyFolderChanges(db: IndexDb, changes: FolderChange[]): ScanDiff {
  return db.transaction((tx) => {
    const diff: ScanDiff = { added: 0, updated: 0, removed: 0 };
    for (const change of changes) {
      const inFolder = and(eq(files.source, 'scan'), eq(files.parentUri, change.uri));
      if (!change.exists) {
        diff.removed += tx.delete(files).where(inFolder).run().changes;
        tx.delete(folderStamps).where(eq(folderStamps.uri, change.uri)).run();
        continue;
      }
      const { added, updated, keepIds } = upsertMany(tx, change.files, 'scan');
      diff.added += added;
      diff.updated += updated;
      const stale = tx
        .select({ id: files.id })
        .from(files)
        .where(inFolder)
        .all()
        .map((r) => r.id)
        .filter((id) => !keepIds.includes(id));
      deleteIds(tx, stale);
      diff.removed += stale.length;
      tx.insert(folderStamps)
        .values({ uri: change.uri, modifiedAt: change.modifiedAt })
        .onConflictDoUpdate({ target: folderStamps.uri, set: { modifiedAt: change.modifiedAt } })
        .run();
    }
    return diff;
  });
}

function getRow(db: IndexDb, id: string): FileRow {
  const row = db.select().from(files).where(eq(files.id, id)).get();
  if (!row) throw new Error(`File not found: ${id}`);
  return row;
}

export function upsertFile(db: IndexDb, info: PdfFileInfo, source: FileRow['source']): FileRow {
  return db.transaction((tx) => {
    // An explicit output/intent registration claims the row; scans never change source.
    upsertMany(tx, [info], source, source === 'output' || source === 'intent');
    return getRow(tx, fileIdForUri(info.uri));
  });
}

export function replaceFile(
  db: IndexDb,
  oldId: string,
  info: PdfFileInfo,
  source: FileRow['source'],
): FileRow {
  return db.transaction((tx) => {
    const old = getRow(tx, oldId);
    const next: NewFileRow = {
      ...toRow(info, source),
      parentUri: info.parentUri === '' ? old.parentUri : info.parentUri,
      folder: info.folder === '' ? old.folder : info.folder,
      isFavorite: old.isFavorite,
      lastPage: old.lastPage,
      lastOpenedAt: old.lastOpenedAt,
      thumbPath: old.thumbPath,
      pageCount: old.pageCount,
      isEncrypted: old.isEncrypted,
      isCorrupt: old.isCorrupt,
    };
    const newId = next.id as string;
    if (newId === oldId) {
      const { id: _id, ...rest } = next;
      tx.update(files).set(rest).where(eq(files.id, oldId)).run();
      return getRow(tx, oldId);
    }
    tx.insert(files)
      .values(next)
      .onConflictDoUpdate({ target: files.id, set: { ...next, id: undefined } })
      .run();
    // Move bookmarks before deleting the old row: the cascade would delete them.
    tx.update(bookmarks).set({ fileId: newId }).where(eq(bookmarks.fileId, oldId)).run();
    tx.delete(files).where(eq(files.id, oldId)).run();
    return getRow(tx, newId);
  });
}

export function removeFile(db: IndexDb, id: string): void {
  db.delete(files).where(eq(files.id, id)).run();
}

export function deleteBySource(db: IndexDb, source: FileRow['source']): number {
  return db.delete(files).where(eq(files.source, source)).run().changes;
}

export function setFavorite(db: IndexDb, id: string, value: boolean): void {
  db.update(files).set({ isFavorite: value }).where(eq(files.id, id)).run();
}

export function markOpened(db: IndexDb, id: string, at: number): void {
  db.update(files).set({ lastOpenedAt: at }).where(eq(files.id, id)).run();
}

export function updateThumb(
  db: IndexDb,
  id: string,
  patch: {
    thumbPath?: string | null;
    pageCount?: number | null;
    isEncrypted?: boolean;
    isCorrupt?: boolean;
  },
): void {
  if (Object.keys(patch).length === 0) return;
  db.update(files).set(patch).where(eq(files.id, id)).run();
}

export function getFolderStamps(db: IndexDb): FolderStamp[] {
  return db.select().from(folderStamps).all();
}

export function listScanRoots(db: IndexDb): ScanRootRow[] {
  return db.select().from(scanRoots).all();
}

export function addScanRoot(
  db: IndexDb,
  root: { uri: string; label: string; addedAt: number },
): void {
  db.insert(scanRoots).values(root).onConflictDoNothing().run();
}

export function removeScanRoot(db: IndexDb, uri: string): number {
  return db.transaction((tx) => {
    const ids = tx
      .select({ id: files.id, uri: files.uri })
      .from(files)
      .where(eq(files.source, 'saf'))
      .all()
      .filter((r) => isUnderRoot(r.uri, uri))
      .map((r) => r.id);
    deleteIds(tx, ids);
    tx.delete(scanRoots).where(eq(scanRoots.uri, uri)).run();
    return ids.length;
  });
}
