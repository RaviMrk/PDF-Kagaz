import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { useTranslation } from 'react-i18next';

import type { FileRow } from '@/db/schema';
import { move } from '@/services/tools/reorder';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';

type Props = {
  files: FileRow[];
  onReorder(ids: string[]): void;
  onRemove(id: string): void;
  /** The scroll view around the list, for auto-scroll while dragging. */
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
};

export function ReorderFiles({ files, onReorder, onRemove, scrollableRef }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const ids = files.map((f) => f.id);

  const button = (
    label: string,
    icon: 'arrow-up' | 'arrow-down' | 'close',
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.button}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
    </Pressable>
  );

  return (
    <Sortable.Grid
      columns={1}
      data={files}
      rowGap={8}
      scrollableRef={scrollableRef}
      keyExtractor={(f: FileRow) => f.id}
      onDragEnd={({ data }: { data: FileRow[] }) => onReorder(data.map((f) => f.id))}
      renderItem={({ item, index }: { item: FileRow; index: number }) => {
        const name = displayName(item.name);
        return (
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            <Text style={[styles.position, { color: colors.textMuted }]}>{index + 1}</Text>
            <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
              {name}
            </Text>
            {index > 0
              ? button(t('merge.moveUp', { name }), 'arrow-up', () =>
                  onReorder(move(ids, index, index - 1)),
                )
              : null}
            {index < files.length - 1
              ? button(t('merge.moveDown', { name }), 'arrow-down', () =>
                  onReorder(move(ids, index, index + 1)),
                )
              : null}
            {button(t('merge.remove', { name }), 'close', () => onRemove(item.id))}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    borderRadius: 12,
    paddingLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  position: { width: 24, fontSize: 14 },
  name: { flex: 1, fontSize: 16 },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
