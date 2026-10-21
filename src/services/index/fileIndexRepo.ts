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
import { isDirectlyInPrimaryAppFolder, isInAppFolder } from '@/utils/appFolder';
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

function toRow(info: PdfFileInfo, source: FileRow['source'], id?: string): NewFileRow {
  return {
    id: id ?? fileIdForUri(info.uri),
    uri: info.uri,
    name: info.name,
    folder: info.folder,
    parentUri: info.parentUri,
    sizeBytes: info.sizeBytes,
    modifiedAt: info.modifiedAt,
    source,
  };
}

const COMPARED = {
  id: files.id,
  name: files.name,
  folder: files.folder,
  parentUri: files.parentUri,
  sizeBytes: files.sizeBytes,
  modifiedAt: files.modifiedAt,
  source: files.source,
};
type ComparedColumns = Pick<
  FileRow,
  'id' | 'name' | 'folder' | 'parentUri' | 'sizeBytes' | 'modifiedAt' | 'source'
>;

/** From this many scanned files on, applyScan reads one table snapshot instead of rows by id. */
const BULK_LOOKUP_MIN = 100;

/** Marks a bulk-lookup row whose compared columns equal the incoming ones. */
const UNCHANGED = Symbol('unchanged');

/** Code points, like SQLite length() on text (JS .length counts UTF-16 units). */
function codePoints(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xd800 || c > 0xdbff || i + 1 >= s.length) n++;
    else {
      const d = s.charCodeAt(i + 1);
      n++;
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
  }
  return n;
}

/**
 * Length-prefixed (so collision-free) signature of the compared columns except source; must
 * match ROW_SIGNATURE. A NULL stored column makes the SQL side NULL, i.e. "changed".
 */
function signature(
  r: Pick<NewFileRow, 'name' | 'folder' | 'parentUri' | 'sizeBytes' | 'modifiedAt'>,
) {
  const parentUri = r.parentUri ?? '';
  return `${codePoints(r.name)}:${r.name}|${codePoints(r.folder)}:${r.folder}|${codePoints(parentUri)}:${parentUri}|${r.sizeBytes}|${r.modifiedAt}`;
}

const ROW_SIGNATURE = sql<
  string | null
>`length(${files.name}) || ':' || ${files.name} || '|' || length(${files.folder}) || ':' || ${files.folder} || '|' || length(${files.parentUri}) || ':' || ${files.parentUri} || '|' || ${files.sizeBytes} || '|' || ${files.modifiedAt}`;

/** One stored row as read by [readSnapshot]; sig is NULL when a compared column is NULL. */
type SnapshotRow = { id: string; uri: string; source: FileRow['source']; sig: string | null };

/**
 * (id, uri, source, signature) of every row, keyed by uri, in one query. Large scans use it
 * instead of hashing every URI, fetching full rows by id and re-reading rows for staleness:
 * on-device each materialised column costs tens of µs and each FNV hash ~0.2 ms.
 */
function readSnapshot(db: IndexDb): Map<string, SnapshotRow> {
  const rows = db
    .select({ id: files.id, uri: files.uri, source: files.source, sig: ROW_SIGNATURE })
    .from(files)
    .all();
  const byUri = new Map<string, SnapshotRow>();
  for (const row of rows) byUri.set(row.uri, row);
  return byUri;
}

/**
 * Existing rows for [incoming], keyed by id. With a [snapshot], an unchanged row is UNCHANGED
 * without reading its columns; rows that need column values (empty native folder/parentUri,
 * signature mismatch) are fetched by id.
 */
function lookupExisting(
  db: IndexDb,
  incoming: NewFileRow[],
  snapshot: Map<string, SnapshotRow> | null,
): Map<string, ComparedColumns | typeof UNCHANGED> {
  const existing = new Map<string, ComparedColumns | typeof UNCHANGED>();
  let byId = incoming;
  if (snapshot) {
    byId = [];
    for (const row of incoming) {
      const stored = snapshot.get(row.uri);
      if (!stored) continue; // new
      if (row.folder !== '' && row.parentUri !== '' && stored.sig === signature(row)) {
        existing.set(stored.id, UNCHANGED);
      } else {
        byId.push(row);
      }
    }
  }
  for (const part of chunks(byId, LOOKUP_CHUNK)) {
    const ids = part.map((r) => r.id as string);
    for (const row of db.select(COMPARED).from(files).where(inArray(files.id, ids)).all()) {
      existing.set(row.id, row);
    }
  }
  return existing;
}

/**
 * Upserts rows; only writes rows that are new or differ. Returns added/updated counts.
 * Conflict update touches only name/folder/parentUri/size/modifiedAt and resets
 * thumb data (incl. encrypted/corrupt flags) when the file content (size or mtime) changed.
 * An empty native parentUri/folder (SAF rename on API 24-25) keeps the old value.
 */
function upsertMany(
  db: IndexDb,
  infos: PdfFileInfo[],
  source: FileRow['source'],
  promote = false,
  snapshot: Map<string, SnapshotRow> | null = null,
) {
  // The snapshot skips source comparison, so promotions always compare full rows.
  const known = promote ? null : snapshot;
  const byId = new Map<string, NewFileRow>();
  for (const info of infos) {
    // id is a pure function of the uri: reuse the stored one instead of re-hashing.
    const row = toRow(info, source, known?.get(info.uri)?.id);
    byId.set(row.id as string, row);
  }
  const incoming = [...byId.values()];

  const existing = lookupExisting(db, incoming, known);
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
    if (old === UNCHANGED) continue;
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

/** Second-precision content key: MediaStore DATE_MODIFIED drops the milliseconds a file stat has. */
const contentKey = (r: { name: string; sizeBytes: number; modifiedAt: number }) =>
  `${r.sizeBytes}|${Math.floor(r.modifiedAt / 1000)}|${r.name}`;

/**
 * One row per moved file. Without full access, "Move to PDFToolkit folder" records the moved file
 * as an 'output' row with a MediaStore uri; a later scan that can see the app folder (a picked
 * Documents tree, or full access after a mode switch) lists the same file under another uri.
 * Rule: a scanned file directly in the primary app folder with the same name, size and
 * modification second as a MediaStore output row (one the scan did not reach directly) is that
 * file — the scanned row takes over the output row's favourite, last page, last opened time and
 * bookmarks (replaceFile semantics) and the output row is dropped.
 * The surviving row keeps source 'output' (scans never demote) under the uri this mode can reach.
 * Returns the number of output rows dropped.
 */
function adoptMovedOutputs(tx: IndexDb, infos: PdfFileInfo[], reachedIds: Set<string>): number {
  const outputs = tx
    .select({
      id: files.id,
      uri: files.uri,
      name: files.name,
      folder: files.folder,
      sizeBytes: files.sizeBytes,
      modifiedAt: files.modifiedAt,
    })
    .from(files)
    .where(eq(files.source, 'output'))
    .all()
    .filter(
      (row) =>
        row.uri.startsWith('content://media/') && !reachedIds.has(row.id) && isInAppFolder(row),
    );
  if (outputs.length === 0) return 0;
  const byContent = new Map(outputs.map((row) => [contentKey(row), row]));
  let adopted = 0;
  for (const info of infos) {
    const output = byContent.get(contentKey(info));
    if (!output || output.uri === info.uri || !isDirectlyInPrimaryAppFolder(info)) continue;
    byContent.delete(contentKey(info));
    replaceFile(tx, output.id, info, 'output');
    adopted++;
  }
  return adopted;
}

export function applyScan(
  db: IndexDb,
  input: { result: ScanResult; source: 'scan' | 'saf' },
): ScanDiff {
  const { result, source } = input;
  return db.transaction((tx) => {
    const snapshot = result.files.length >= BULK_LOOKUP_MIN ? readSnapshot(tx) : null;
    const { added, updated, keepIds } = upsertMany(tx, result.files, source, false, snapshot);
    const keep = new Set(keepIds);
    const roots = result.scannedRoots.filter(
      (r) => !result.failedRoots.some((f) => f === r || isUnderRoot(r, f)),
    );
    // A scan never changes a row's source, so the pre-upsert snapshot still holds for this.
    const ofSource = snapshot
      ? [...snapshot.values()].filter((row) => row.source === source)
      : tx
          .select({ id: files.id, uri: files.uri })
          .from(files)
          .where(eq(files.source, source))
          .all();
    const stale = ofSource
      .filter(
        (row) =>
          !keep.has(row.id) &&
          roots.some((r) => isUnderRoot(row.uri, r)) &&
          !result.failedRoots.some((f) => isUnderRoot(row.uri, f)),
      )
      .map((row) => row.id);
    deleteIds(tx, stale);
    const adopted = adoptMovedOutputs(tx, result.files, keep);

    if (source === 'scan') {
      tx.delete(folderStamps).run();
      const stamps = new Map<string, number>();
      for (const f of result.files) stamps.set(f.parentUri, f.parentModifiedAt);
      const rows = [...stamps].map(([uri, modifiedAt]) => ({ uri, modifiedAt }));
      for (const part of chunks(rows, INSERT_CHUNK * 2)) {
        tx.insert(folderStamps).values(part).run();
      }
    }
    return { added, updated, removed: stale.length + adopted };
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
      diff.removed += stale.length + adoptMovedOutputs(tx, change.files, new Set(keepIds));
      tx.insert(folderStamps)
        .values({ uri: change.uri, modifiedAt: change.modifiedAt })
        .onConflictDoUpdate({ target: folderStamps.uri, set: { modifiedAt: change.modifiedAt } })
        .run();
    }
    return diff;
  });
}

export function getFile(db: IndexDb, id: string): FileRow | undefined {
  return db.select().from(files).where(eq(files.id, id)).get();
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

export function setLastPage(db: IndexDb, id: string, page: number): void {
  db.update(files).set({ lastPage: page }).where(eq(files.id, id)).run();
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
