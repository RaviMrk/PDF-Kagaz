import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AdBanner } from '@/components/AdBanner';
import { ChoiceChips } from '@/components/ChoiceChips';
import { EmptyState } from '@/components/EmptyState';
import { FileActionsSheet } from '@/components/FileActionsSheet';
import { FileRow } from '@/components/FileRow';
import { FolderRow } from '@/components/FolderRow';
import { PermissionGate } from '@/components/PermissionGate';
import { ScanProgressBanner } from '@/components/ScanProgressBanner';
import { SelectionBar } from '@/components/SelectionBar';
import { SearchBar } from '@/components/SearchBar';
import { SortMenu } from '@/components/SortMenu';
import type { FileRow as FileRowData } from '@/db/schema';
import { deleteFiles, favoriteTarget } from '@/services/files/bulkActions';
import {
  groupByFolder,
  queryFiles,
  type FileSegment,
  type FolderGroup,
} from '@/services/files/fileQuery';
import { pruneSelection, selectionActions, toggleId } from '@/services/files/selection';
import { shareFiles } from '@/services/reader/readerActions';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';
import { fileActionErrorKey } from '@/utils/fileActionError';

const SEGMENTS: { key: FileSegment; label: string }[] = [
  { key: 'all', label: 'files.segmentAll' },
  { key: 'recent', label: 'files.segmentRecent' },
  { key: 'favorites', label: 'files.segmentFavorites' },
  { key: 'folders', label: 'files.segmentFolders' },
];

const RESULT_MS = 4000;

const keyOfFile = (f: FileRowData) => f.id;
const keyOfFolder = (g: FolderGroup) => g.parentUri;

function FilesList() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { focus } = useLocalSearchParams<{ focus?: string }>();

  const files = useFiles((s) => s.files);
  const status = useFiles((s) => s.status);
  const progress = useFiles((s) => s.progress);
  const notice = useFiles((s) => s.notice);
  const error = useFiles((s) => s.error);
  const sortKey = useSettings((s) => s.filesSortKey);
  const sortDir = useSettings((s) => s.filesSortDir);

  const [segment, setSegment] = useState<FileSegment>('all');
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<FolderGroup | null>(null);
  const [actionFile, setActionFile] = useState<FileRowData | null>(null);
  const [pickedIds, setSelectedIds] = useState<string[]>([]);
  // The outcome of a bulk delete or share, already translated; shown like the store notice.
  const [result, setResult] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  // A share copies each file:// PDF first: one at a time, shown on the button while it runs.
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  // Rows can vanish (delete, rescan); the selection only keeps ids still present in `files`.
  const selectedIds = useMemo(() => pruneSelection(pickedIds, files), [pickedIds, files]);
  const selecting = selectedIds.length > 0;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useFiles.getState().clearNotice(), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  // Android back inside a folder returns to the folder list instead of leaving the tab.
  // Focus-scoped: a screen pushed on top (the reader) must get back first.
  useFocusEffect(
    useCallback(() => {
      if (!folder) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setFolder(null);
        return true;
      });
      return () => sub.remove();
    }, [folder]),
  );

  // Leaving the tab by any route (tab switch, deep link) drops the selection.
  useFocusEffect(
    useCallback(() => {
      return () => setSelectedIds([]);
    }, []),
  );

  // Registered after the folder handler so it runs first: back ends selection before leaving a folder.
  useFocusEffect(
    useCallback(() => {
      if (!selecting) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelectedIds([]);
        return true;
      });
      return () => sub.remove();
    }, [selecting]),
  );

  const fileRows = useMemo(
    () =>
      segment === 'folders' && !folder
        ? []
        : queryFiles(files, {
            segment: segment === 'folders' ? 'all' : segment,
            sortKey,
            sortDir,
            search,
            parentUri: segment === 'folders' ? folder?.parentUri : null,
          }),
    [files, segment, folder, sortKey, sortDir, search],
  );
  const folderRows = useMemo(
    () => (segment === 'folders' && !folder ? groupByFolder(files, search) : []),
    [files, segment, folder, search],
  );

  const openFile = useCallback((f: FileRowData) => {
    router.push({ pathname: '/reader/[id]', params: { id: f.id } });
  }, []);
  const toggleFile = useCallback(
    (f: FileRowData) =>
      setSelectedIds((ids) => toggleId(pruneSelection(ids, useFiles.getState().files), f.id)),
    [],
  );
  const startSelection = useCallback((f: FileRowData) => setSelectedIds([f.id]), []);
  const exitSelection = useCallback(() => setSelectedIds([]), []);
  const selectAll = useCallback(() => setSelectedIds(fileRows.map((r) => r.id)), [fileRows]);
  const selectedRows = useMemo(
    () =>
      selectedIds.flatMap((id) => {
        const row = files.find((r) => r.id === id);
        return row ? [row] : [];
      }),
    [selectedIds, files],
  );
  const actions = useMemo(() => selectionActions(selectedRows), [selectedRows]);
  const launchTool = useCallback(
    (toolId: 'merge' | 'split') => {
      const inputs = selectedIds.join(',');
      setSelectedIds([]);
      router.push({ pathname: '/tool/[toolId]', params: { toolId, inputs } });
    },
    [selectedIds],
  );
  const launchOrganize = useCallback(() => {
    const id = selectedIds[0];
    if (!id) return;
    setSelectedIds([]);
    router.push({ pathname: '/tool/organize/[id]', params: { id } });
  }, [selectedIds]);
  const runDelete = useCallback(
    async (ids: string[]) => {
      if (deletingRef.current) return;
      deletingRef.current = true;
      setDeleting(true);
      // One at a time through the single-file delete; rows that fail stay in the list.
      const { deleted, failed } = await deleteFiles(ids, (id) => useFiles.getState().remove(id));
      deletingRef.current = false;
      setDeleting(false);
      setSelectedIds([]);
      const firstFailure = failed[0];
      if (!firstFailure) setResult(t('files.deletedMany', { count: deleted.length }));
      else if (ids.length === 1) setResult(t(fileActionErrorKey(firstFailure.error)));
      else {
        setResult(
          t('files.deletePartial', {
            deleted: deleted.length,
            count: ids.length,
            failed: failed.length,
          }),
        );
      }
    },
    [t],
  );
  const confirmDeleteSelected = useCallback(() => {
    const first = selectedRows[0];
    if (deletingRef.current || !first) return;
    const count = selectedRows.length;
    const ids = selectedRows.map((r) => r.id);
    Alert.alert(
      t('files.deleteManyTitle', { count }),
      t('files.deleteManyBody', { count, name: displayName(first.name) }),
      [
        { text: t('files.cancel'), style: 'cancel' },
        { text: t('files.delete'), style: 'destructive', onPress: () => void runDelete(ids) },
      ],
    );
  }, [selectedRows, runDelete, t]);
  const favoriteSelected = useCallback(() => {
    const add = favoriteTarget(selectedRows);
    for (const r of selectedRows) {
      if (r.isFavorite !== add) useFiles.getState().toggleFavorite(r.id);
    }
    setSelectedIds([]);
  }, [selectedRows]);
  const shareSelected = useCallback(async () => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    let outcome;
    try {
      outcome = await shareFiles(
        selectedRows.map((r) => r.uri),
        t('files.shareManyTitle'),
      );
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
    if (outcome !== 'ok') setResult(t(fileActionErrorKey(outcome)));
  }, [selectedRows, t]);
  const openMore = useCallback((f: FileRowData) => setActionFile(f), []);
  const closeMore = useCallback(() => setActionFile(null), []);
  const openFolder = useCallback((g: FolderGroup) => setFolder(g), []);
  const refresh = useCallback(() => void useFiles.getState().refresh('full'), []);

  const refreshing = status === 'scanning';
  const showFolders = segment === 'folders' && !folder;

  const emptyTitle = (() => {
    if (search.trim() !== '') return t('files.emptySearch', { query: search });
    if (segment === 'favorites') return t('files.emptyFavorites');
    if (segment === 'recent') return t('files.emptyRecent');
    // The first scan is still running: "No PDFs found yet" would be premature.
    if (status === 'scanning') return t('files.emptyScanning');
    return t('files.emptyAll');
  })();
  const empty = <EmptyState icon="file-pdf-box" title={emptyTitle} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {selecting ? (
          <SelectionBar
            count={selectedIds.length}
            actions={actions}
            favoriteAdds={favoriteTarget(selectedRows)}
            deleting={deleting}
            sharing={sharing}
            onDelete={confirmDeleteSelected}
            onShare={() => void shareSelected()}
            onFavorite={favoriteSelected}
            onMerge={() => launchTool('merge')}
            onSplit={() => launchTool('split')}
            onOrganize={launchOrganize}
            onSelectAll={selectAll}
            onExit={exitSelection}
          />
        ) : (
          <>
            <SearchBar
              placeholder={t('files.searchPlaceholder')}
              value={search}
              onChangeText={setSearch}
              autoFocus={!!focus}
              focusSignal={focus}
            />
            <View style={styles.controls}>
              <View style={styles.segments}>
                <ChoiceChips
                  scroll
                  label={t('files.segmentsLabel')}
                  value={segment}
                  onChange={(s) => {
                    setSegment(s);
                    setFolder(null);
                  }}
                  options={SEGMENTS.map((s) => ({ key: s.key, label: t(s.label) }))}
                />
              </View>
              <SortMenu
                sortKey={sortKey}
                sortDir={sortDir}
                onChange={(k, d) => useSettings.getState().setFilesSort(k, d)}
              />
            </View>
            {segment === 'folders' && folder ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('files.back')}
                onPress={() => setFolder(null)}
                style={[styles.chip, { backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.text }}>{t('files.back')}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      {status === 'scanning' ? (
        <ScanProgressBanner count={progress?.found ?? files.length} />
      ) : null}
      {error ? (
        <View style={[styles.banner, { backgroundColor: colors.surface }]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.bannerText, { color: colors.text }]}
          >
            {t(error === 'cache' ? 'files.errorCache' : 'files.errorScan')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('errors.retry')}
            onPress={refresh}
            style={styles.retry}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('errors.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {showFolders ? (
        <FlashList
          testID="files-list"
          data={folderRows}
          keyExtractor={keyOfFolder}
          renderItem={({ item }) => <FolderRow group={item} onPress={openFolder} />}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={empty}
        />
      ) : (
        <FlashList
          testID="files-list"
          data={fileRows}
          keyExtractor={keyOfFile}
          renderItem={({ item }) => (
            <FileRow
              file={item}
              onPress={selecting ? toggleFile : openFile}
              onMore={openMore}
              onLongPress={startSelection}
              selectionMode={selecting}
              selected={selectedSet.has(item.id)}
            />
          )}
          extraData={selectedSet}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={empty}
        />
      )}

      {result || notice ? (
        <View style={[styles.snackbar, { backgroundColor: colors.text }]}>
          <Text accessibilityLiveRegion="polite" style={{ color: colors.background }}>
            {result ?? (notice ? t(fileActionErrorKey(notice)) : '')}
          </Text>
        </View>
      ) : null}
      <FileActionsSheet file={actionFile} onClose={closeMore} />
    </View>
  );
}

export default function Screen() {
  return (
    <View style={styles.screen}>
      <View style={styles.screen}>
        <PermissionGate>
          <FilesList />
        </PermissionGate>
      </View>
      <AdBanner placement="files" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: 16, gap: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segments: { flex: 1 },
  chip: {
    alignSelf: 'flex-start',
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  banner: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  bannerText: { flex: 1 },
  retry: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  snackbar: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 12, borderRadius: 8 },
});
