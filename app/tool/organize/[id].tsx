import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { OrganizeActionBar } from '@/components/tools/OrganizeActionBar';
import { OrganizeGrid } from '@/components/tools/OrganizeGrid';
import { ProgressSheet } from '@/components/tools/ProgressSheet';
import { useToolPreview } from '@/components/tools/useToolPreview';
import type { FileRow } from '@/db/schema';
import type { PageThumbLoader } from '@/services/reader/pageThumbLoader';
import { failureMessage } from '@/services/tools/failureMessage';
import { ORGANIZE_MAX_PAGES } from '@/services/tools/limits';
import {
  initialOrganize,
  isUnchanged,
  organizeReducer,
  toPageEdits,
  type OrganizeState,
} from '@/services/tools/organizeState';
import type { OrganizeRequest } from '@/services/tools/runTool';
import { createToolThumbLoader } from '@/services/tools/toolThumbs';
import { useFiles } from '@/stores/filesStore';
import { useToolJobs } from '@/stores/toolJobStore';
import { useTheme } from '@/theme/useTheme';

const TILE_DP = 110;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/tools');
}

export default function OrganizeScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const files = useFiles((s) => s.files);
  const row = useMemo(() => files.find((f) => f.id === id) ?? null, [files, id]);
  if (!row) return <EmptyState icon="file-question-outline" title={t('reader.errorNoRow')} />;
  return <OrganizeLoader key={row.id} row={row} />;
}

function OrganizeLoader({ row }: { row: FileRow }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // The preview stages the file for thumbnails; it lives as long as this screen.
  const { state, password, dialog } = useToolPreview(row);
  const loaded =
    state.kind === 'ready' && state.pageCount > ORGANIZE_MAX_PAGES
      ? ({ kind: 'tooMany' } as const)
      : state;

  if (loaded.kind === 'ready') {
    return (
      <Editor row={row} fileUri={loaded.fileUri} pageCount={loaded.pageCount} password={password} />
    );
  }
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        {loaded.kind === 'loading' ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textMuted }}>{t('tool.loadingPages')}</Text>
          </>
        ) : (
          <>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.message, { color: colors.danger }]}
            >
              {loaded.kind === 'tooMany'
                ? t('toolError.tooManyPages')
                : failureMessage(loaded.failure, row.name, t)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('reader.close')}
              onPress={leave}
              style={styles.textButton}
            >
              <Text style={[styles.textButtonLabel, { color: colors.primary }]}>
                {t('reader.close')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
      {dialog}
    </SafeAreaView>
  );
}

/** `password`: the one that opened a locked file's preview, passed with the job. */
type EditorProps = { row: FileRow; fileUri: string; pageCount: number; password: string | null };

function Editor({ row, fileUri, pageCount, password }: EditorProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [state, dispatch] = useReducer(organizeReducer, pageCount, (n): OrganizeState =>
    initialOrganize(n),
  );
  const unchanged = isUnchanged(state, pageCount);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const onToggle = useCallback(
    (key: string) => setSelectedKey((k) => (k === key ? null : key)),
    [],
  );
  const onReorder = useCallback((keys: string[]) => dispatch({ type: 'reorder', keys }), []);
  // Selection follows the page's key; a deleted page clears it.
  const selectedAt = state.pages.findIndex((p) => p.key === selectedKey);
  const selected = selectedAt >= 0 ? state.pages[selectedAt]! : null;
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const loader = useMemo<PageThumbLoader>(
    () => createToolThumbLoader(fileUri, Math.min(240, Math.round(TILE_DP * PixelRatio.get()))),
    [fileUri],
  );
  useEffect(() => () => loader.cancelPending(), [loader]);

  const starting = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const active = useToolJobs((s) => s.active);
  const last = useToolJobs((s) => s.last);
  const running = jobId !== null && active?.jobId === jobId ? active : null;
  const finished = jobId !== null && last?.jobId === jobId;
  useEffect(() => {
    if (finished && jobId) router.replace({ pathname: '/result', params: { jobId } });
  }, [finished, jobId]);

  // Leaving with unsaved edits asks first; a running job is left to its sheet.
  const guard = jobId === null && !unchanged;
  const discarding = useRef(false);
  const confirmLeave = useCallback(
    (proceed: () => void) => {
      Alert.alert(t('organize.discardTitle'), t('organize.discardBody'), [
        { text: t('organize.keep'), style: 'cancel' },
        {
          text: t('organize.discard'),
          style: 'destructive',
          // The leave below must pass the beforeRemove guard without a second prompt.
          onPress: () => {
            discarding.current = true;
            proceed();
          },
        },
      ]);
    },
    [t],
  );
  useFocusEffect(
    useCallback(() => {
      if (!guard) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        confirmLeave(leave);
        return true;
      });
      return () => sub.remove();
    }, [guard, confirmLeave]),
  );
  // Covers gestures and header back, which never reach BackHandler.
  useEffect(() => {
    if (!guard) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (discarding.current) return;
      e.preventDefault();
      confirmLeave(() => navigation.dispatch(e.data.action));
    });
  }, [guard, navigation, confirmLeave]);

  const save = () => {
    if (starting.current || unchanged) return;
    starting.current = true;
    setNotice(null);
    const request: OrganizeRequest = {
      toolId: 'organize',
      inputIds: [row.id],
      pages: toPageEdits(state),
    };
    const result = useToolJobs
      .getState()
      .start(password === null ? request : { ...request, passwords: { 0: password } }, t);
    if (result.ok) {
      setJobId(result.jobId);
      return;
    }
    starting.current = false;
    setNotice(t(result.reason === 'busy' ? 'toolError.busy' : 'toolError.unknown'));
  };

  const back = () => {
    if (guard) confirmLeave(leave);
    else leave();
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tool.back')}
          onPress={back}
          style={styles.textButton}
        >
          <Text style={[styles.textButtonLabel, { color: colors.primary }]}>{t('tool.back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('organize.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('organize.save')}
          accessibilityState={{ disabled: unchanged }}
          disabled={unchanged}
          onPress={save}
          style={[styles.save, { backgroundColor: colors.primary }, unchanged && styles.dim]}
        >
          <Text style={[styles.textButtonLabel, { color: colors.onPrimary }]}>
            {t('organize.save')}
          </Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.textMuted }}>{t('organize.hint')}</Text>
      <Text style={{ color: colors.textMuted }}>{t('organize.selectHint')}</Text>
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {notice}
        </Text>
      ) : null}
      {state.pages.length === 1 ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted }}>
          {t('organize.lastPage')}
        </Text>
      ) : null}
      <Animated.ScrollView ref={scrollRef} style={styles.list}>
        <OrganizeGrid
          pages={state.pages}
          loader={loader}
          selectedKey={selected?.key ?? null}
          onToggle={onToggle}
          onReorder={onReorder}
          scrollableRef={scrollRef}
        />
      </Animated.ScrollView>
      <OrganizeActionBar
        page={selected}
        position={selectedAt + 1}
        count={state.pages.length}
        dispatch={dispatch}
      />
      <ProgressSheet
        visible={running !== null}
        title={t('progress.title.organize')}
        phase={running?.phase ?? 'preparing'}
        fraction={running?.fraction ?? 0}
        onCancel={() => useToolJobs.getState().cancel()}
        onHide={leave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '600' },
  list: { flex: 1 },
  textButton: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, justifyContent: 'center' },
  textButtonLabel: { fontSize: 16, fontWeight: '600' },
  save: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
