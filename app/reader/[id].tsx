import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { PasswordDialog } from '@/components/PasswordDialog';
import { JumpToPageDialog } from '@/components/reader/JumpToPageDialog';
import {
  PdfView,
  type OutlineItem,
  type PdfViewErrorKind,
  type PdfViewHandle,
} from '@/components/reader/PdfView';
import { ReaderBottomBar } from '@/components/reader/ReaderBottomBar';
import { ReaderMessage } from '@/components/reader/ReaderMessage';
import { ReaderTopBar } from '@/components/reader/ReaderTopBar';
import type { FileRow } from '@/db/schema';
import { createLastPageSaver } from '@/services/reader/lastPageSaver';
import { closeReader, openReaderFile, shouldDropMissing } from '@/services/reader/prepareReader';
import { readerReducer, type ReaderFailure } from '@/services/reader/readerState';
import { useFiles } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';

const FAILURE_KEYS: Record<ReaderFailure, string> = {
  notFound: 'reader.errorNotFound',
  unavailable: 'reader.errorUnavailable',
  permission: 'reader.errorPermission',
  invalid: 'reader.errorInvalid',
  io: 'reader.errorIo',
  unknown: 'reader.errorUnknown',
};
const RETRYABLE: ReadonlySet<ReaderFailure> = new Set(['io', 'unknown', 'unavailable']);

/** A page is spoken once it has stayed put this long, so fast scrolling does not flood TalkBack. */
const ANNOUNCE_DELAY_MS = 500;

const isPageOf = (page: number, pageCount: number) =>
  Number.isInteger(page) && page >= 1 && page <= pageCount;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

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

  const onLoad = ({ pageCount }: { pageCount: number; outline: OutlineItem[] }) => {
    dispatch({ type: 'loaded', pageCount });
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

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      {showViewer ? (
        <PdfView
          ref={pdf}
          fileUri={phase.fileUri}
          password={phase.password}
          initialPage={page}
          horizontal={false}
          onLoad={onLoad}
          onPageChange={onPageChange}
          onError={onError}
          onTap={onTap}
        />
      ) : phase.kind === 'preparing' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textMuted }}>{t('reader.loading')}</Text>
        </View>
      ) : null}
      {barsVisible ? <ReaderTopBar title={row.name} onClose={leave} /> : null}
      {barsVisible && phase.kind === 'ready' ? (
        <ReaderBottomBar
          page={page}
          pageCount={pageCount}
          onPressPage={() => setJumpVisible(true)}
        />
      ) : null}
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
        fileName={row.name}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
