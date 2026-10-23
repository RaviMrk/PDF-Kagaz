import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { ProgressSheet } from '@/components/tools/ProgressSheet';
import { ScanReview } from '@/components/tools/ScanReview';
import type { ImageFilter } from '@/services/native/pdfNative';
import { DEFAULT_SCAN_LAYOUT, type ImageLayoutOptions } from '@/services/pdf/imageLayout';
import { appendItems, nextSourceIndex, removeKey, reorderByKeys } from '@/services/tools/imageList';
import {
  addScannedPages,
  discardImageSession,
  newImageSessionId,
  openImageSession,
  type ImageItem,
} from '@/services/tools/imageSession';
import { scanName } from '@/services/tools/outputNames';
import { useToolJobs } from '@/stores/toolJobStore';
import { useTheme } from '@/theme/useTheme';

type Phase = 'launching' | 'review' | 'unavailable' | 'failed';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

function ActionButton({ label, onPress }: { label: string; onPress(): void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.action, { borderColor: colors.primary }]}
    >
      <Text style={[styles.label, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/** The document scanner: launch ML Kit, review and filter the pages, then save one PDF. */
export default function ScanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [sessionId] = useState(() => newImageSessionId());
  const [phase, setPhase] = useState<Phase>('launching');
  const [items, setItems] = useState<ImageItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<ImageFilter>('colour');
  const [layout, setLayout] = useState<ImageLayoutOptions>(DEFAULT_SCAN_LAYOUT);
  const [name, setName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [placeholder] = useState(() => scanName(Date.now(), t).replace(/\.pdf$/, ''));

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const alive = useRef(true);
  const opened = useRef(false);
  const ready = useRef(false);
  const busy = useRef(false);
  const started = useRef(false);
  const starting = useRef(false);
  const deleted = useRef(false);
  const discarding = useRef(false);
  // Indices are never reused, even after the highest page was removed.
  const highWater = useRef(0);
  const hadPages = useRef(false);

  // Deletes the session at most once, and never after a job took it over.
  const dropSession = useCallback(() => {
    if (started.current || deleted.current) return;
    deleted.current = true;
    discardImageSession(sessionId);
  }, [sessionId]);

  const scanPages = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const more = itemsRef.current.length > 0;
    setNotice(null);
    setPhase(more ? 'review' : 'launching');
    if (more) setScanning(true);
    // A session that failed to open is opened again before the scanner.
    if (!ready.current) {
      ready.current = await openImageSession(sessionId);
      if (!alive.current) {
        busy.current = false;
        if (!started.current) discardImageSession(sessionId);
        return;
      }
      if (!ready.current) {
        busy.current = false;
        setScanning(false);
        setPhase('failed');
        return;
      }
    }
    const current = itemsRef.current;
    const result = await addScannedPages(
      sessionId,
      Math.max(nextSourceIndex(current), highWater.current),
      current.length,
    );
    busy.current = false;
    if (!alive.current) {
      // Left while scanning: these files landed after the session was deleted.
      if (!started.current) discardImageSession(sessionId);
      return;
    }
    setScanning(false);
    if (!result.ok) {
      const copy = t(result.reason === 'unavailable' ? 'scan.unavailable' : 'scan.failed');
      if (current.length > 0 || hadPages.current) {
        setNotice(copy);
        setPhase('review');
      } else {
        setPhase(result.reason);
      }
      return;
    }
    if (result.items.length === 0) {
      // A cancelled scan adds nothing; with no pages at all there is nothing to review.
      if (current.length === 0 && !hadPages.current) {
        dropSession();
        leave();
      } else {
        setPhase('review');
      }
      return;
    }
    hadPages.current = true;
    highWater.current = Math.max(highWater.current, nextSourceIndex(result.items));
    setItems((list) => appendItems(list, result.items));
    setPhase('review');
  }, [sessionId, t, dropSession]);
  useEffect(() => {
    alive.current = true;
    if (!opened.current) {
      opened.current = true;
      void scanPages();
    }
    return () => {
      alive.current = false;
      dropSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useToolJobs((s) => s.active);
  const last = useToolJobs((s) => s.last);
  const running = jobId !== null && active?.jobId === jobId ? active : null;
  const finished = jobId !== null && last?.jobId === jobId;
  useEffect(() => {
    if (finished && jobId) router.replace({ pathname: '/result', params: { jobId } });
  }, [finished, jobId]);

  const guard = jobId === null && items.length > 0;
  const confirmLeave = useCallback(
    (proceed: () => void) => {
      Alert.alert(t('scan.discardTitle'), t('scan.discardBody'), [
        { text: t('images.keep'), style: 'cancel' },
        {
          text: t('images.discard'),
          style: 'destructive',
          // The leave below must pass the beforeRemove guard without a second prompt.
          onPress: () => {
            discarding.current = true;
            dropSession();
            proceed();
          },
        },
      ]);
    },
    [t, dropSession],
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
  useEffect(() => {
    if (!guard) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (discarding.current) return;
      e.preventDefault();
      confirmLeave(() => navigation.dispatch(e.data.action));
    });
  }, [guard, navigation, confirmLeave]);

  const save = () => {
    if (starting.current || items.length === 0) return;
    starting.current = true;
    setNotice(null);
    const result = useToolJobs.getState().start(
      {
        toolId: 'scan',
        inputIds: [],
        sessionId,
        images: items.map((i) => i.index),
        filter,
        layout,
        name: name.trim() === '' ? null : name,
      },
      t,
    );
    if (result.ok) {
      started.current = true;
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

  let body;
  if (phase === 'launching') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textMuted }}>{t('scan.launching')}</Text>
      </View>
    );
  } else if (phase === 'unavailable' || phase === 'failed') {
    body = (
      <View style={styles.center}>
        <EmptyState
          icon="file-document-alert-outline"
          title={t(phase === 'unavailable' ? 'scan.unavailable' : 'scan.failed')}
        />
        {phase === 'unavailable' ? (
          <ActionButton
            label={t('scan.useImages')}
            onPress={() =>
              router.replace({ pathname: '/tool/[toolId]', params: { toolId: 'images-to-pdf' } })
            }
          />
        ) : (
          <ActionButton label={t('scan.retry')} onPress={() => void scanPages()} />
        )}
        <ActionButton label={t('scan.close')} onPress={leave} />
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <View style={styles.center}>
        <EmptyState icon="file-hidden" title={t('scan.noPages')} message={notice ?? undefined} />
        <ActionButton label={t('scan.scan')} onPress={() => void scanPages()} />
      </View>
    );
  } else {
    body = (
      <ScanReview
        sessionId={sessionId}
        items={items}
        filter={filter}
        layout={layout}
        name={name}
        namePlaceholder={placeholder}
        notice={notice}
        scanning={scanning}
        saveDisabled={jobId !== null}
        onFilterChange={setFilter}
        onLayoutChange={setLayout}
        onNameChange={setName}
        onReorder={(keys) => setItems((l) => reorderByKeys(l, keys))}
        onRemove={(key) => setItems((l) => removeKey(l, key))}
        onScanMore={() => void scanPages()}
        onSave={save}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tool.back')}
          onPress={back}
          style={styles.textButton}
        >
          <Text style={[styles.label, { color: colors.primary }]}>{t('tool.back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('scan.title')}
        </Text>
      </View>
      {body}
      <ProgressSheet
        visible={running !== null}
        title={t('progress.title.scan')}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', gap: 12 },
  textButton: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '600' },
  action: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
