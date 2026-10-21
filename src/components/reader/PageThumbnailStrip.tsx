import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createPageThumbLoader } from '@/services/reader/pageThumbLoader';
import { useTheme } from '@/theme/useTheme';

type Loader = ReturnType<typeof createPageThumbLoader>;

type Props = {
  fileUri: string;
  pageCount: number;
  currentPage: number;
  onSelect(page: number): void;
};

const ITEM_WIDTH = 64;
const IMAGE_HEIGHT = 88;

/**
 * Horizontal strip of page thumbnails. Each item requests its own image when rendered; the
 * loader is per file and drops its queue on unmount, and an item asks again whenever it (re)binds
 * to a page, so a page whose request was dropped is re-requested when it scrolls back into view.
 */
export function PageThumbnailStrip({ fileUri, pageCount, currentPage, onSelect }: Props) {
  const { colors } = useTheme();
  // The native reader lane renders one page at a time; one in flight keeps the newest request
  // first in line and lets an encrypted file stop after a single native call.
  const loader = useMemo(
    () =>
      createPageThumbLoader({
        fileUri,
        width: Math.min(240, Math.round(ITEM_WIDTH * PixelRatio.get())),
        concurrency: 1,
      }),
    [fileUri],
  );
  useEffect(() => () => loader.cancelPending(), [loader]);

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);
  const initialIndex = Math.min(Math.max(currentPage - 1, 0), Math.max(pageCount - 1, 0));
  const [startIndex] = useState(initialIndex);

  return (
    <View
      style={[styles.strip, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="reader-thumbnails"
    >
      <FlashList
        horizontal
        data={pages}
        extraData={currentPage}
        initialScrollIndex={startIndex}
        keyExtractor={String}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Thumb page={item} loader={loader} selected={item === currentPage} onSelect={onSelect} />
        )}
      />
    </View>
  );
}

type ThumbProps = { page: number; loader: Loader; selected: boolean; onSelect(page: number): void };

const Thumb = memo(function Thumb({ page, loader, selected, onSelect }: ThumbProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [result, setResult] = useState<{ page: number; uri: string | null } | null>(null);
  const uri = result?.page === page ? result.uri : loader.get(page);

  // Always asks: a cached page is answered synchronously, which also covers a page that settled
  // between this render and the effect (a recycled item would otherwise keep its placeholder).
  useEffect(() => {
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
      accessibilityRole="button"
      accessibilityLabel={t('reader.thumbPage', { page })}
      accessibilityState={{ selected }}
      onPress={() => onSelect(page)}
      style={styles.item}
    >
      <View
        style={[
          styles.frame,
          { borderColor: selected ? colors.primary : colors.border },
          selected && styles.frameSelected,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="contain" />
        ) : (
          <View style={[styles.image, styles.placeholder, { backgroundColor: colors.background }]}>
            <Text style={{ color: colors.textMuted }}>{page}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  strip: {
    height: IMAGE_HEIGHT + 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    width: ITEM_WIDTH,
    minHeight: 48,
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  frame: { width: '100%', borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  frameSelected: { borderWidth: 3 },
  image: { width: '100%', height: IMAGE_HEIGHT - 8 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
