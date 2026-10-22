import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SelectionActions } from '@/services/files/selection';
import { useTheme } from '@/theme/useTheme';

type Props = {
  count: number;
  actions: SelectionActions;
  onMerge: () => void;
  onSplit: () => void;
  onOrganize: () => void;
  onSelectAll: () => void;
  onExit: () => void;
};

export function SelectionBar({
  count,
  actions,
  onMerge,
  onSplit,
  onOrganize,
  onSelectAll,
  onExit,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const action = (label: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={[styles.action, { backgroundColor: colors.surface, opacity: enabled ? 1 : 0.4 }]}
    >
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.bar}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('files.exitSelection')}
          onPress={onExit}
          style={styles.icon}
        >
          <MaterialCommunityIcons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={[styles.count, { color: colors.text }]}>
          {t('files.selectedCount', { count })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('files.selectAll')}
          onPress={onSelectAll}
          style={styles.selectAll}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('files.selectAll')}</Text>
        </Pressable>
      </View>
      <View style={styles.actions}>
        {action(t('files.mergeSelected'), actions.merge, onMerge)}
        {action(t('files.splitSelected'), actions.split, onSplit)}
        {action(t('files.organizeSelected'), actions.organize, onOrganize)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  count: { flex: 1, fontSize: 18, fontWeight: '600' },
  selectAll: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    minHeight: 48,
    minWidth: 96,
    borderRadius: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
