import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { ImageTile } from '@/components/tools/ImageTile';
import type { ImageFilter } from '@/services/native/pdfNative';
import type { ImageItem } from '@/services/tools/imageSession';
import { move } from '@/services/tools/reorder';
import { useTheme } from '@/theme/useTheme';

type Props = {
  sessionId: string;
  items: ImageItem[];
  filter: ImageFilter;
  kind: 'image' | 'page';
  onReorder(keys: string[]): void;
  onRemove(key: string): void;
  /** The scroll view around the grid, for auto-scroll while dragging. */
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
};

const keyOf = (i: ImageItem) => i.key;

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Drag to reorder, or tap a tile and use the bar below: one set of buttons for the selection
 * instead of buttons on every tile.
 */
export function ImageGrid({
  sessionId,
  items,
  filter,
  kind,
  onReorder,
  onRemove,
  scrollableRef,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const at = items.findIndex((i) => i.key === pickedKey);
  const selected = at >= 0 ? at : null;
  const total = items.length;

  const onPress = useCallback((key: string) => setPickedKey((k) => (k === key ? null : key)), []);
  const renderItem = useCallback(
    ({ item, index }: { item: ImageItem; index: number }) => (
      <ImageTile
        sessionId={sessionId}
        item={item}
        filter={filter}
        position={index + 1}
        total={total}
        selected={item.key === pickedKey}
        kind={kind}
        onPress={onPress}
      />
    ),
    [sessionId, filter, total, pickedKey, kind, onPress],
  );
  const onDragEnd = useCallback(
    ({ data }: { data: ImageItem[] }) => onReorder(data.map(keyOf)),
    [onReorder],
  );

  const prefix = kind === 'image' ? 'images' : 'scan';
  const shown = selected === null ? '' : String(selected + 1);
  const button = (name: string, icon: Icon, off: boolean, run: () => void) => {
    const disabled = selected === null || off;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(`${prefix}.${name}`, { n: shown })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={run}
        style={[styles.button, disabled && styles.dim]}
      >
        <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      </Pressable>
    );
  };

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
      <Text style={{ color: colors.textMuted }}>{t(`${prefix}.selectHint`)}</Text>
      <View style={[styles.bar, { backgroundColor: colors.surface }]}>
        {button('moveEarlier', 'arrow-left', selected === 0, () =>
          onReorder(move(items.map(keyOf), selected ?? 0, (selected ?? 0) - 1)),
        )}
        {button('moveLater', 'arrow-right', selected === total - 1, () =>
          onReorder(move(items.map(keyOf), selected ?? 0, (selected ?? 0) + 1)),
        )}
        {button('remove', 'delete-outline', false, () => {
          const key = items[selected ?? 0]?.key;
          if (key === undefined) return;
          setPickedKey(null);
          onRemove(key);
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', borderRadius: 12 },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
});
