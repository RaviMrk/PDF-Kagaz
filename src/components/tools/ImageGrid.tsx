import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { ImageTile } from '@/components/tools/ImageTile';
import type { ImageFilter } from '@/services/native/pdfNative';
import type { ImageItem } from '@/services/tools/imageSession';
import { useTheme } from '@/theme/useTheme';

type Props = {
  sessionId: string;
  items: ImageItem[];
  filter: ImageFilter;
  kind: 'image' | 'page';
  /** From useImageSelection; the action bar is rendered by the screen. */
  selectedKey: string | null;
  onTileToggle(key: string): void;
  onReorder(keys: string[]): void;
  /** The scroll view around the grid, for auto-scroll while dragging. */
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
};

const keyOf = (i: ImageItem) => i.key;

/** Drag to reorder, or tap a tile and use the screen's ImageActionBar. */
export function ImageGrid({
  sessionId,
  items,
  filter,
  kind,
  selectedKey,
  onTileToggle,
  onReorder,
  scrollableRef,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const total = items.length;
  const renderItem = useCallback(
    ({ item, index }: { item: ImageItem; index: number }) => (
      <ImageTile
        sessionId={sessionId}
        item={item}
        filter={filter}
        position={index + 1}
        total={total}
        selected={item.key === selectedKey}
        kind={kind}
        onPress={onTileToggle}
      />
    ),
    [sessionId, filter, total, selectedKey, kind, onTileToggle],
  );
  const onDragEnd = useCallback(
    ({ data }: { data: ImageItem[] }) => onReorder(data.map(keyOf)),
    [onReorder],
  );
  return (
    <View style={styles.root}>
      <Sortable.Grid
        columns={3}
        data={items}
        rowGap={8}
        columnGap={8}
        scrollableRef={scrollableRef}
        keyExtractor={keyOf}
        onDragEnd={onDragEnd}
        renderItem={renderItem}
      />
      <Text style={{ color: colors.textMuted }}>
        {t(kind === 'image' ? 'images.selectHint' : 'scan.selectHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: 8 } });
