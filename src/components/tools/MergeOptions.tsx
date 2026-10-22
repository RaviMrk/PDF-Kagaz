import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { ReorderFiles } from '@/components/tools/ReorderFiles';
import { RunButton } from '@/components/tools/RunButton';
import type { FileRow } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';

type Props = {
  rows: FileRow[];
  onChange(ids: string[]): void;
  onRun(): void;
};

export function MergeOptions({ rows, onChange, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Sortable.Grid auto-scrolls this view while an item is dragged near its edges.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const disabled = rows.length < 2;
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {t('merge.orderTitle')}
      </Text>
      <Text style={{ color: colors.textMuted }}>{t('merge.orderHint')}</Text>
      <Animated.ScrollView ref={scrollRef} style={styles.list}>
        <ReorderFiles
          files={rows}
          onReorder={onChange}
          onRemove={(id) => onChange(rows.filter((r) => r.id !== id).map((r) => r.id))}
          scrollableRef={scrollRef}
        />
      </Animated.ScrollView>
      <RunButton
        label={t('merge.run', { count: rows.length })}
        disabled={disabled}
        onPress={onRun}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  list: { flex: 1 },
});
