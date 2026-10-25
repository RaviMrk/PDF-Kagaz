import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/BottomSheet';
import type { SelectionActions } from '@/services/files/selection';
import { useTheme } from '@/theme/useTheme';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

type Props = {
  count: number;
  actions: SelectionActions;
  /** The favourite action adds favourites (some row is not one) rather than removing them. */
  favoriteAdds: boolean;
  /** A delete is running: Delete is disabled and shows progress. */
  deleting: boolean;
  onDelete: () => void;
  onShare: () => void;
  onFavorite: () => void;
  onMerge: () => void;
  onSplit: () => void;
  onOrganize: () => void;
  onSelectAll: () => void;
  onExit: () => void;
};

/**
 * Multi-select header. Delete, Share and Merge stay on the bar (content-sized, one-line labels that
 * move whole to a second row rather than clip); the rest sit under More.
 */
export function SelectionBar({
  count,
  actions,
  favoriteAdds,
  deleting,
  onDelete,
  onShare,
  onFavorite,
  onMerge,
  onSplit,
  onOrganize,
  onSelectAll,
  onExit,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  const barAction = (
    label: string,
    icon: Icon,
    enabled: boolean,
    onPress: () => void,
    busy = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled, busy }}
      disabled={!enabled}
      onPress={onPress}
      style={[styles.action, { backgroundColor: colors.surface, opacity: enabled ? 1 : 0.4 }]}
    >
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
      )}
      <Text numberOfLines={1} style={[styles.actionText, { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );

  const moreItem = (label: string, icon: Icon, enabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => {
        setMoreOpen(false);
        onPress();
      }}
      style={[styles.moreItem, !enabled && styles.dim]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      <Text style={[styles.moreText, { color: colors.text }]}>{label}</Text>
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
        {barAction(t('files.delete'), 'delete-outline', !deleting, onDelete, deleting)}
        {barAction(t('files.shareSelected'), 'share-variant', true, onShare)}
        {barAction(t('files.mergeSelected'), 'file-multiple-outline', actions.merge, onMerge)}
        {barAction(t('files.moreSelected'), 'dots-horizontal', true, () => setMoreOpen(true))}
      </View>
      <BottomSheet
        visible={moreOpen}
        onRequestClose={() => setMoreOpen(false)}
        onScrimPress={() => setMoreOpen(false)}
        scrimLabel={t('files.close')}
      >
        {moreItem(
          favoriteAdds ? t('files.favoriteMany') : t('files.unfavoriteMany'),
          favoriteAdds ? 'star-outline' : 'star-off-outline',
          true,
          onFavorite,
        )}
        {moreItem(t('files.splitSelected'), 'content-cut', actions.split, onSplit)}
        {moreItem(
          t('files.organizeSelected'),
          'file-arrow-up-down-outline',
          actions.organize,
          onOrganize,
        )}
      </BottomSheet>
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
    minHeight: 56,
    minWidth: 64,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionText: { fontSize: 13, fontWeight: '600' },
  moreItem: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48 },
  moreText: { fontSize: 16 },
  dim: { opacity: 0.4 },
});
