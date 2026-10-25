import { MaterialCommunityIcons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PasswordDialog } from '@/components/PasswordDialog';
import { JumpToPageDialog } from '@/components/reader/JumpToPageDialog';
import {
  PdfView,
  type OutlineItem,
  type PdfViewErrorKind,
  type PdfViewHandle,
} from '@/components/reader/PdfView';
import { PageThumbnailStrip, THUMBNAIL_STRIP_HEIGHT } from '@/components/reader/PageThumbnailStrip';
import { READER_BOTTOM_BAR_HEIGHT, ReaderBottomBar } from '@/components/reader/ReaderBottomBar';
import { ReaderMenu } from '@/components/reader/ReaderMenu';
import { ReaderMessage } from '@/components/reader/ReaderMessage';
import { ReaderSideSheet } from '@/components/reader/ReaderSideSheet';
import { ReaderTopBar } from '@/components/reader/ReaderTopBar';
import type { FileRow } from '@/db/schema';
import { createLastPageSaver } from '@/services/reader/lastPageSaver';
import { flattenOutline, type OutlineRow } from '@/services/reader/outline';
import { closeReader, openReaderFile, shouldDropMissing } from '@/services/reader/prepareReader';
import {
  runReaderAction,
  type ReaderAction,
  type ReaderActionResult,
} from '@/services/reader/readerActions';
import { readerBackground, readerFilter } from '@/services/reader/readerFilters';
import { readerReducer, type ReaderFailure } from '@/services/reader/readerState';
import { useBookmarks } from '@/services/reader/useBookmarks';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';

const FAILURE_KEYS: Record<ReaderFailure, string> = {
  notFound: 'reader.errorNotFound',
  unavailable: 'reader.errorUnavailable',
  permission: 'reader.errorPermission',
  invalid: 'reader.errorInvalid',
  io: 'reader.errorIo',
  unknown: 'reader.errorUnknown',
};
const ACTION_FAILURE_KEYS: Record<Exclude<ReaderActionResult, 'ok'>, string> = {
  notFound: 'reader.errorNotFound',
  unavailable: 'reader.errorUnavailable',
  permission: 'reader.errorPermission',
  unknown: 'reader.actionFailed',
};
const NOTICE_MS = 4000;
const KEEP_AWAKE_TAG = 'reader';

const RETRYABLE: ReadonlySet<ReaderFailure> = new Set(['io', 'unknown', 'unavailable']);

/** A page is spoken once it has stayed put this long, so fast scrolling does not flood TalkBack. */
const ANNOUNCE_DELAY_MS = 500;

const isPageOf = (page: number, pageCount: number) =>
  Number.isInteger(page) && page >= 1 && page <= pageCount;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/** Keeps the screen on while `on`; released when turned off, in the background and on unmount. */
function useReaderKeepAwake(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const activate = () => void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    const deactivate = () =>
      void Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
    activate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') activate();
      else if (state === 'background') deactivate();
    });
    return () => {
      sub.remove();
      deactivate();
    };
  }, [on]);
}

const printTitle = (name: string) => displayName(name).replace(/\.pdf$/i, '');

function startPage(row: FileRow): number {
  const p = row.lastPage;
  return p !== null && Number.isInteger(p) && p >= 1 ? p : 1;
}

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // A new document id gets a fresh reader (state, saver, native document).
  return <Reader key={id} id={id} />;
}

function Reader({ id }: { id: string }) {
  const { t } = useTranslation();
  const [row] = useState(() => useFiles.getState().getRow(id));

  useEffect(() => () => closeReader(), [id]);

  if (!row) return <ReaderMessage title={t('reader.errorNoRow')} onClose={leave} />;
  return <OpenReader row={row} />;
}

function OpenReader({ row }: { row: FileRow }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const id = row.id;
  const [phase, dispatch] = useReducer(readerReducer, { kind: 'preparing' });
  const [page, setPage] = useState(() => startPage(row));
  const pageRef = useRef(page);
  const [barsVisible, setBarsVisible] = useState(true);
  const [jumpVisible, setJumpVisible] = useState(false);
  const [thumbsVisible, setThumbsVisible] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [outline, setOutline] = useState<OutlineRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // Share / print / open-with may copy a large file first; one at a time, shown while it runs.
  const [actionBusy, setActionBusy] = useState(false);
  const busyRef = useRef(false);
  const readerTheme = useSettings((s) => s.readerTheme);
  const keepAwake = useSettings((s) => s.readerKeepAwake);
  const horizontal = useSettings((s) => s.readerHorizontal);
  const marks = useBookmarks(id);
  const insets = useSafeAreaInsets();
  const pdf = useRef<PdfViewHandle>(null);
  // First-page timing starts at mount, or at the last password submit: typing time is not load time.
  const loadStartedAt = useRef(0);
  const logged = useRef(false);
  const opened = useRef(false);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saver = useRef<ReturnType<typeof createLastPageSaver> | null>(null);

  useEffect(() => {
    loadStartedAt.current = Date.now();
  }, []);

  // Only while the document shows: not on the password, error or loading screens.
  useReaderKeepAwake(keepAwake && phase.kind === 'ready');

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(
    () => () => {
      if (announceTimer.current !== null) clearTimeout(announceTimer.current);
    },
    [],
  );

  // Created per document inside the effect: StrictMode / Fast Refresh re-run it with a live saver.
  useEffect(() => {
    const s = createLastPageSaver((p) => useFiles.getState().setLastPage(id, p));
    saver.current = s;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') s.flush();
    });
    return () => {
      sub.remove();
      s.dispose();
      if (saver.current === s) saver.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (phase.kind !== 'preparing') return;
    let alive = true;
    void openReaderFile(row.uri).then((result) => {
      if (!alive) return;
      if (result.ok) {
        dispatch({ type: 'prepared', fileUri: result.fileUri });
        return;
      }
      if (shouldDropMissing(result.reason)) useFiles.getState().dropMissing(id);
      dispatch({ type: 'prepareFailed', reason: result.reason });
    });
    return () => {
      alive = false;
    };
  }, [phase.kind, row.uri, id]);

  const showPage = (p: number) => {
    pageRef.current = p;
    setPage(p);
  };

  const onLoad = ({ pageCount, outline }: { pageCount: number; outline: OutlineItem[] }) => {
    dispatch({ type: 'loaded', pageCount });
    setOutline(flattenOutline(outline));
    if (!logged.current) {
      logged.current = true;
      console.log(`[reader] first page ${Date.now() - loadStartedAt.current}ms ${pageCount} pages`);
    }
    if (!opened.current) {
      opened.current = true;
      useFiles.getState().markOpened(id);
    }
    if (pageCount < 1) return;
    if (pageRef.current > pageCount) {
      pdf.current?.goToPage(pageCount);
      showPage(pageCount);
    } else {
      showPage(pageRef.current);
    }
  };

  const onPageChange = (p: number, pageCount: number) => {
    if (!isPageOf(p, pageCount)) return;
    showPage(p);
    saver.current?.update(p);
    if (announceTimer.current !== null) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => {
      announceTimer.current = null;
      AccessibilityInfo.announceForAccessibility(
        t('reader.pageAnnounce', { page: p, count: pageCount }),
      );
    }, ANNOUNCE_DELAY_MS);
  };

  const onError = (kind: PdfViewErrorKind) => dispatch({ type: 'pdfError', kind });
  const onTap = useCallback(() => setBarsVisible((v) => !v), []);
  const goTo = useCallback((p: number) => pdf.current?.goToPage(p), []);

  const runAction = async (action: ReaderAction) => {
    setMenuVisible(false);
    if (busyRef.current) return;
    // Printing re-opens the file natively without the password (until M7).
    if (action === 'print' && phase.kind === 'ready' && phase.password !== '') {
      setNotice('reader.printProtected');
      return;
    }
    const title =
      action === 'share'
        ? t('reader.shareTitle')
        : action === 'openWith'
          ? t('reader.openWithTitle')
          : printTitle(row.name);
    busyRef.current = true;
    setActionBusy(true);
    setNotice(null);
    let result: ReaderActionResult;
    try {
      result = await runReaderAction(action, { uri: row.uri, title });
    } finally {
      busyRef.current = false;
      setActionBusy(false);
    }
    if (result === 'ok') return;
    if (result === 'notFound') useFiles.getState().dropMissing(id);
    setNotice(ACTION_FAILURE_KEYS[result]);
  };

  if (phase.kind === 'failed') {
    return (
      <ReaderMessage
        title={t(FAILURE_KEYS[phase.reason])}
        onClose={leave}
        onRetry={RETRYABLE.has(phase.reason) ? () => dispatch({ type: 'retry' }) : undefined}
      />
    );
  }

  const pageCount = phase.kind === 'ready' ? phase.pageCount : 0;
  const showViewer = phase.kind === 'loading' || phase.kind === 'ready';
  const ready = phase.kind === 'ready';
  const bookmarked = marks.isBookmarked(page);
  const stripHeight = ready && thumbsVisible ? THUMBNAIL_STRIP_HEIGHT : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      {showViewer ? (
        <View
          testID="reader-viewer"
          collapsable={false}
          style={{
            flex: 1,
            // The bars overlay the screen: the document starts below the top bar and ends above the
            // bottom bar (and the thumbnail strip on it) while they show, so its first and last
            // page can be scrolled fully into view. The bottom inset keeps the end above the system
            // navigation bar in edge-to-edge.
            paddingTop: barsVisible ? insets.top + TOP_BAR_HEIGHT : 0,
            paddingBottom:
              insets.bottom + (barsVisible ? READER_BOTTOM_BAR_HEIGHT + stripHeight : 0),
            filter: readerFilter(readerTheme),
            backgroundColor: readerBackground(readerTheme),
          }}
        >
          <PdfView
            ref={pdf}
            fileUri={phase.fileUri}
            password={phase.password}
            initialPage={page}
            horizontal={horizontal}
            onLoad={onLoad}
            onPageChange={onPageChange}
            onError={onError}
            onTap={onTap}
          />
        </View>
      ) : phase.kind === 'preparing' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textMuted }}>{t('reader.loading')}</Text>
        </View>
      ) : null}
      {barsVisible ? (
        <ReaderTopBar title={displayName(row.name)} onClose={leave}>
          {ready ? (
            <>
              <BarButton
                label={t(bookmarked ? 'reader.removeBookmark' : 'reader.addBookmark')}
                icon={bookmarked ? 'bookmark' : 'bookmark-outline'}
                color={bookmarked ? colors.primary : colors.text}
                onPress={() => marks.toggle(page)}
              />
              <BarButton
                label={t('reader.openSheet')}
                icon="table-of-contents"
                color={colors.text}
                onPress={() => setSheetVisible(true)}
              />
              <BarButton
                label={t('reader.more')}
                icon="dots-vertical"
                color={colors.text}
                onPress={() => setMenuVisible(true)}
              />
            </>
          ) : null}
        </ReaderTopBar>
      ) : null}
      {barsVisible && ready ? (
        <ReaderBottomBar page={page} pageCount={pageCount} onPressPage={() => setJumpVisible(true)}>
          <BarButton
            label={t('reader.nightMode')}
            icon="weather-night"
            color={readerTheme === 'night' ? colors.primary : colors.text}
            selected={readerTheme === 'night'}
            onPress={() =>
              useSettings.getState().setReaderTheme(readerTheme === 'night' ? 'normal' : 'night')
            }
          />
          <BarButton
            label={t('reader.thumbnails')}
            icon="view-carousel-outline"
            color={thumbsVisible ? colors.primary : colors.text}
            selected={thumbsVisible}
            onPress={() => setThumbsVisible((v) => !v)}
          />
        </ReaderBottomBar>
      ) : null}
      {barsVisible && ready && thumbsVisible ? (
        <View style={[styles.thumbs, { bottom: READER_BOTTOM_BAR_HEIGHT + insets.bottom }]}>
          <PageThumbnailStrip
            fileUri={phase.fileUri}
            pageCount={pageCount}
            currentPage={page}
            onSelect={goTo}
          />
        </View>
      ) : null}
      {actionBusy || notice ? (
        <View
          style={[
            styles.snackbar,
            { backgroundColor: colors.text, bottom: READER_BOTTOM_BAR_HEIGHT + 16 + insets.bottom },
          ]}
        >
          {actionBusy ? <ActivityIndicator size="small" color={colors.background} /> : null}
          <Text accessibilityLiveRegion="polite" style={{ color: colors.background }}>
            {actionBusy ? t('reader.preparing') : t(notice ?? '')}
          </Text>
        </View>
      ) : null}
      <ReaderSideSheet
        visible={sheetVisible && ready}
        outline={outline}
        bookmarks={marks.bookmarks}
        onGo={goTo}
        onRemoveBookmark={marks.remove}
        onClose={() => setSheetVisible(false)}
      />
      <ReaderMenu
        visible={menuVisible && ready}
        theme={readerTheme}
        keepAwake={keepAwake}
        horizontal={horizontal}
        actionBusy={actionBusy}
        onTheme={(theme) => useSettings.getState().setReaderTheme(theme)}
        onKeepAwake={(on) => useSettings.getState().setReaderKeepAwake(on)}
        onHorizontal={(on) => useSettings.getState().setReaderHorizontal(on)}
        onAction={(action) => void runAction(action)}
        onClose={() => setMenuVisible(false)}
      />
      <JumpToPageDialog
        visible={jumpVisible && phase.kind === 'ready'}
        pageCount={pageCount}
        onGo={(p) => {
          setJumpVisible(false);
          pdf.current?.goToPage(p);
        }}
        onCancel={() => setJumpVisible(false)}
      />
      <PasswordDialog
        visible={phase.kind === 'needsPassword'}
        fileName={displayName(row.name)}
        wrong={phase.kind === 'needsPassword' && phase.wrong}
        onSubmit={(password) => {
          loadStartedAt.current = Date.now();
          dispatch({ type: 'submitPassword', password });
        }}
        onCancel={leave}
      />
    </View>
  );
}

type BarButtonProps = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  selected?: boolean;
  onPress(): void;
};

function BarButton({ label, icon, color, selected, onPress }: BarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={styles.iconButton}
    >
      <MaterialCommunityIcons name={icon} size={24} color={color} />
    </Pressable>
  );
}

/** ReaderTopBar's minimum height (without the top inset). */
const TOP_BAR_HEIGHT = 56;

const styles = StyleSheet.create({
  root: { flex: 1 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  thumbs: { position: 'absolute', left: 0, right: 0 },
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
