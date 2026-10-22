import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const files = sqliteTable(
  'files',
  {
    id: text().primaryKey(),
    uri: text().notNull().unique(),
    name: text().notNull(),
    folder: text().notNull(),
    parentUri: text('parent_uri'),
    sizeBytes: integer('size_bytes').notNull(),
    modifiedAt: integer('modified_at').notNull(),
    pageCount: integer('page_count'),
    thumbPath: text('thumb_path'),
    isEncrypted: integer('is_encrypted', { mode: 'boolean' }).notNull().default(false),
    isCorrupt: integer('is_corrupt', { mode: 'boolean' }).notNull().default(false),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    lastPage: integer('last_page'),
    lastOpenedAt: integer('last_opened_at'),
    source: text({ enum: ['scan', 'saf', 'intent', 'output'] }).notNull(),
  },
  (t) => [
    index('files_folder_idx').on(t.folder),
    index('files_parent_uri_idx').on(t.parentUri),
    index('files_is_favorite_idx').on(t.isFavorite),
    index('files_last_opened_at_idx').on(t.lastOpenedAt),
  ],
);

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    page: integer().notNull(),
    label: text().notNull().default(''),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('bookmarks_file_id_idx').on(t.fileId)],
);

export const scanRoots = sqliteTable('scan_roots', {
  uri: text().primaryKey(),
  label: text().notNull(),
  addedAt: integer('added_at').notNull(),
});

export const folderStamps = sqliteTable('folder_stamps', {
  uri: text().primaryKey(),
  modifiedAt: integer('modified_at').notNull(),
});

export const toolJobs = sqliteTable('tool_jobs', {
  id: text().primaryKey(),
  toolId: text('tool_id').notNull(),
  inputIds: text('input_ids', { mode: 'json' }).$type<string[]>().notNull(),
  options: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text({
    enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
  }).notNull(),
  outputIds: text('output_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  outputUri: text('output_uri'),
  error: text(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const signatures = sqliteTable('signatures', {
  id: integer().primaryKey({ autoIncrement: true }),
  pngPath: text('png_path').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
export type BookmarkRow = typeof bookmarks.$inferSelect;
export type NewBookmarkRow = typeof bookmarks.$inferInsert;
export type ScanRootRow = typeof scanRoots.$inferSelect;
export type NewScanRootRow = typeof scanRoots.$inferInsert;
export type FolderStampRow = typeof folderStamps.$inferSelect;
export type ToolJobRow = typeof toolJobs.$inferSelect;
export type NewToolJobRow = typeof toolJobs.$inferInsert;
export type SignatureRow = typeof signatures.$inferSelect;
export type NewSignatureRow = typeof signatures.$inferInsert;
