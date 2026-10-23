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
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { ImageActionBar } from '@/components/tools/ImageActionBar';
import { ImageGrid } from '@/components/tools/ImageGrid';
import { ImageLayoutOptions } from '@/components/tools/ImageLayoutOptions';
import { ProgressSheet } from '@/components/tools/ProgressSheet';
import { RunButton } from '@/components/tools/RunButton';
import { useImageSelection } from '@/components/tools/useImageSelection';
import {
  DEFAULT_IMAGES_LAYOUT,
  type ImageLayoutOptions as Layout,
} from '@/services/pdf/imageLayout';
import { appendItems, nextSourceIndex, removeKey, reorderByKeys } from '@/services/tools/imageList';
import {
  addPickedImages,
  discardImageSession,
  newImageSessionId,
  openImageSession,
  type ImageItem,
} from '@/services/tools/imageSession';
import { IMAGES_MAX } from '@/services/tools/limits';
import { imagesName } from '@/services/tools/outputNames';
import { useToolJobs } from '@/stores/toolJobStore';
import { useTheme } from '@/theme/useTheme';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/tools');
}

/** Images to PDF: pick photos, reorder, choose the page layout and run. */
export function ImagesToPdfFlow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [sessionId] = useState(() => newImageSessionId());
  const [items, setItems] = useState<ImageItem[]>([]);
  const [adding, setAdding] = useState(true);
  const [notices, setNotices] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout>(DEFAULT_IMAGES_LAYOUT);
  const [name, setName] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [placeholder] = useState(() => imagesName(Date.now(), t).replace(/\.pdf$/, ''));

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const alive = useRef(true);
  const started = useRef(false);
  const starting = useRef(false);
  const busyAdding = useRef(false);
  const opened = useRef(false);
  const ready = useRef(false);
  const discarding = useRef(false);
  const deleted = useRef(false);
  // Deletes the session at most once, and never after a job took it over.
  const dropSession = useCallback(() => {
    if (started.current || deleted.current) return;
    deleted.current = true;
    discardImageSession(sessionId);
  }, [sessionId]);

  const add = useCallback(async () => {
    if (busyAdding.current) return;
    busyAdding.current = true;
    setAdding(true);
    setNotices([]);
    // A session that failed to open on entry is opened again before the picker.
    if (!ready.current) {
      ready.current = await openImageSession(sessionId);
      if (!ready.current) {
        busyAdding.current = false;
        if (alive.current) {
          setNotices([t('toolError.unknown')]);
          setAdding(false);
        }
        return;
      }
    }
    const current = itemsRef.current;
    const result = await addPickedImages(sessionId, nextSourceIndex(current), current.length);
    busyAdding.current = false;
    if (!alive.current) {
      // Left while importing: these files landed after the session was deleted.
      if (!started.current) discardImageSession(sessionId);
      return;
    }
    setItems((list) => appendItems(list, result.items));
    const next: string[] = [];
    if (result.failed > 0) next.push(t('images.addFailed', { count: result.failed }));
    if (result.limited) next.push(t('images.limitReached', { max: IMAGES_MAX }));
    setNotices(next);
    setAdding(false);
  }, [sessionId, t]);

  // Opens the session and the picker at once; the session goes away unless a job took it over.
  useEffect(() => {
    alive.current = true;
    if (!opened.current) {
      opened.current = true;
      void add();
    }
    return () => {
      alive.current = false;
      dropSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useImageSelection(
    items,
    (keys) => setItems((l) => reorderByKeys(l, keys)),
    (key) => setItems((l) => removeKey(l, key)),
  );

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
      Alert.alert(t('images.discardTitle'), t('images.discardBody'), [
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

  const run = () => {
    if (starting.current || items.length === 0) return;
    starting.current = true;
    setNotices([]);
    const result = useToolJobs.getState().start(
      {
        toolId: 'images-to-pdf',
        inputIds: [],
        sessionId,
        images: items.map((i) => i.index),
        filter: 'colour',
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
    setNotices([t(result.reason === 'busy' ? 'toolError.busy' : 'toolError.unknown')]);
  };

  const back = () => {
    if (guard) confirmLeave(leave);
    else leave();
  };

  const full = items.length >= IMAGES_MAX;
  const addButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('images.add')}
      accessibilityState={{ disabled: full || adding }}
      disabled={full || adding}
      onPress={() => void add()}
      style={[styles.add, { borderColor: colors.primary }, (full || adding) && styles.dim]}
    >
      <Text style={[styles.label, { color: colors.primary }]}>{t('images.add')}</Text>
    </Pressable>
  );

  const header = (
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
        {t('tools.imagesToPdf')}
      </Text>
    </View>
  );
  const noticeLines = notices.map((n) => (
    <Text key={n} accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
      {n}
    </Text>
  ));
  const spinner = adding ? (
    <View style={styles.row}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ color: colors.textMuted }}>{t('images.adding')}</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      {header}
      {noticeLines}
      {items.length === 0 ? (
        <View style={styles.empty}>
          {adding ? (
            spinner
          ) : (
            <>
              <EmptyState icon="image-multiple-outline" title={t('images.emptyTitle')} />
              {addButton}
            </>
          )}
        </View>
      ) : (
        <>
          <Animated.ScrollView
            ref={scrollRef}
            style={styles.list}
            contentContainerStyle={styles.body}
          >
            <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted }}>
              {t('images.count', { count: items.length })}
            </Text>
            <ImageGrid
              sessionId={sessionId}
              items={items}
              filter="colour"
              kind="image"
              selectedKey={select.selectedKey}
              onTileToggle={select.toggle}
              onReorder={(keys) => setItems((l) => reorderByKeys(l, keys))}
              scrollableRef={scrollRef}
            />
            {spinner}
            {addButton}
            {full ? <Text style={{ color: colors.textMuted }}>{t('images.limitHint')}</Text> : null}
            <ImageLayoutOptions
              value={layout}
              onChange={setLayout}
              name={name}
              namePlaceholder={placeholder}
              onNameChange={setName}
            />
          </Animated.ScrollView>
          <ImageActionBar
            kind="image"
            selected={select.position}
            total={items.length}
            onEarlier={select.moveEarlier}
            onLater={select.moveLater}
            onRemove={select.remove}
          />
          <RunButton label={t('images.run')} disabled={adding} onPress={run} />
        </>
      )}
      <ProgressSheet
        visible={running !== null}
        title={t('progress.title.images-to-pdf')}
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
  list: { flex: 1 },
  body: { gap: 12, paddingBottom: 16 },
  empty: { flex: 1, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  textButton: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '600' },
  add: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
