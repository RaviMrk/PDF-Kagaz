import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createToolThumbLoader } from '@/services/tools/toolThumbs';
import { useTheme } from '@/theme/useTheme';
import { formatPageRanges, parsePageRanges, uniqueSortedPages } from '@/utils/pageRanges';
import type { PageRangeError } from '@/utils/pageRanges';
import type { PageThumbLoader } from '@/services/reader/pageThumbLoader';

type Props = {
  pageCount: number;
  fileUri: string | null;
  selected: readonly number[];
  onChange(selected: number[]): void;
};

const COLUMNS = 3;
const TILE_DP = 96;

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function PagePicker({ pageCount, fileUri, selected, onChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [text, setText] = useState(() => formatPageRanges(selected));
  const [error, setError] = useState<PageRangeError | null>(null);
  // The last selection this field itself produced; echoing it back must not rewrite what is typed.
  const typed = useRef<readonly number[]>(selected);

  useEffect(() => {
    if (sameList(selected, typed.current)) return;
    typed.current = selected;
    setText(formatPageRanges(selected));
    setError(null);
  }, [selected]);

  const loader = useMemo(
    () =>
      fileUri
        ? createToolThumbLoader(fileUri, Math.min(240, Math.round(TILE_DP * PixelRatio.get())))
        : null,
    [fileUri],
  );
  useEffect(() => () => loader?.cancelPending(), [loader]);

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);
  const chosen = useMemo(() => new Set(selected), [selected]);

  const emit = (next: number[]) => {
    typed.current = next;
    onChange(next);
  };
  const onEdit = (value: string) => {
    setText(value);
    const parsed = parsePageRanges(value, pageCount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    emit(uniqueSortedPages(parsed.groups));
  };
  const toggle = (page: number) =>
    emit(
      uniqueSortedPages([
        chosen.has(page) ? selected.filter((p) => p !== page) : [...selected, page],
      ]),
    );
  const selectAll = () => {
    setText(formatPageRanges(pages));
    setError(null);
    emit(pages);
  };
  const clear = () => {
    setText('');
    setError(null);
    emit([]);
  };

  return (
    <View style={styles.root}>
      <TextInput
        accessibilityLabel={t('pages.rangeLabel')}
        placeholder={t('pages.rangePlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={onEdit}
        autoCorrect={false}
        style={[
          styles.input,
          { color: colors.text, borderColor: error ? colors.danger : colors.border },
        ]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {t(`pages.error${error[0]!.toUpperCase()}${error.slice(1)}`, { count: pageCount })}
        </Text>
      ) : null}
      <View style={styles.bar}>
        <Text accessibilityLiveRegion="polite" style={[styles.count, { color: colors.textMuted }]}>
          {t('pages.selectedCount', { count: selected.length })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pages.selectAll')}
          onPress={selectAll}
          style={styles.action}
        >
          <Text style={{ color: colors.primary }}>{t('pages.selectAll')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pages.clear')}
          onPress={clear}
          style={styles.action}
        >
          <Text style={{ color: colors.primary }}>{t('pages.clear')}</Text>
        </Pressable>
      </View>
      <FlashList
        data={pages}
        numColumns={COLUMNS}
        extraData={selected}
        keyExtractor={String}
        renderItem={({ item }) => (
          <Tile page={item} checked={chosen.has(item)} loader={loader} onToggle={toggle} />
        )}
      />
    </View>
  );
}

type TileProps = {
  page: number;
  checked: boolean;
  loader: PageThumbLoader | null;
  onToggle(page: number): void;
};

const Tile = memo(function Tile({ page, checked, loader, onToggle }: TileProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [result, setResult] = useState<{ page: number; uri: string | null } | null>(null);
  const uri = loader ? (result?.page === page ? result.uri : loader.get(page)) : null;

  useEffect(() => {
    if (!loader) return;
    let alive = true;
    loader.request(page, (done) => {
      if (alive) setResult({ page, uri: done });
    });
    return () => {
      alive = false;
    };
  }, [loader, page]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={t('pages.page', { page })}
      accessibilityState={{ checked }}
      onPress={() => onToggle(page)}
      style={styles.tile}
    >
      <View
        style={[
          styles.frame,
          { borderColor: checked ? colors.primary : colors.border },
          checked && styles.frameChecked,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="contain" />
        ) : (
          <View style={[styles.image, styles.placeholder, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textMuted }}>{page}</Text>
          </View>
        )}
      </View>
      <Text style={{ color: checked ? colors.primary : colors.textMuted }}>{page}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { flex: 1 },
  action: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, justifyContent: 'center' },
  tile: { flex: 1, minHeight: 48, padding: 4, alignItems: 'center', gap: 2 },
  frame: { width: '100%', borderWidth: 1, borderRadius: 6, overflow: 'hidden' },
  frameChecked: { borderWidth: 3 },
  image: { width: '100%', aspectRatio: 0.75 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
