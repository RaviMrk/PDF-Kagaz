import type { FileRow } from '@/db/schema';

export type FileSegment = 'all' | 'recent' | 'favorites' | 'folders';
export type SortKey = 'name' | 'date' | 'size';
export type SortDir = 'asc' | 'desc';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function normalizeForSearch(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase();
}

const byId = (a: FileRow, b: FileRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function recentFiles(files: readonly FileRow[], limit: number): FileRow[] {
  const opened: FileRow[] = [];
  const rest: FileRow[] = [];
  for (const f of files) (f.lastOpenedAt != null ? opened : rest).push(f);
  opened.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || byId(a, b));
  rest.sort((a, b) => b.modifiedAt - a.modifiedAt || byId(a, b));
  return opened.concat(rest).slice(0, limit);
}

export type FileQuery = {
  segment: Exclude<FileSegment, 'folders'>;
  sortKey: SortKey;
  sortDir: SortDir;
  search: string;
  parentUri?: string | null;
};

export function queryFiles(files: readonly FileRow[], q: FileQuery): FileRow[] {
  let rows: FileRow[] = files.filter((f) => q.parentUri == null || f.parentUri === q.parentUri);
  if (q.segment === 'favorites') rows = rows.filter((f) => f.isFavorite);
  const needle = normalizeForSearch(q.search.trim());
  if (needle !== '') rows = rows.filter((f) => normalizeForSearch(f.name).includes(needle));
  if (q.segment === 'recent') return recentFiles(rows, 50);

  const dir = q.sortDir === 'asc' ? 1 : -1;
  const cmp = (a: FileRow, b: FileRow): number => {
    switch (q.sortKey) {
      case 'name':
        return collator.compare(a.name, b.name);
      case 'date':
        return a.modifiedAt - b.modifiedAt;
      case 'size':
        return a.sizeBytes - b.sizeBytes;
    }
  };
  return rows.sort((a, b) => cmp(a, b) * dir || byId(a, b));
}

export type FolderGroup = {
  parentUri: string;
  folder: string;
  count: number;
  latestModifiedAt: number;
};

export function groupByFolder(files: readonly FileRow[], search: string): FolderGroup[] {
  const needle = normalizeForSearch(search.trim());
  const groups = new Map<string, FolderGroup>();
  for (const f of files) {
    if (f.parentUri == null) continue;
    const g = groups.get(f.parentUri);
    if (g) {
      g.count++;
      g.latestModifiedAt = Math.max(g.latestModifiedAt, f.modifiedAt);
    } else {
      groups.set(f.parentUri, {
        parentUri: f.parentUri,
        folder: f.folder,
        count: 1,
        latestModifiedAt: f.modifiedAt,
      });
    }
  }
  return [...groups.values()]
    .filter((g) => needle === '' || normalizeForSearch(g.folder).includes(needle))
    .sort((a, b) => collator.compare(a.folder, b.folder) || (a.parentUri < b.parentUri ? -1 : 1));
}
