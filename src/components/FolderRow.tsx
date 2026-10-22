import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { FolderGroup } from '@/services/files/fileQuery';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';

type Props = { group: FolderGroup; onPress: (group: FolderGroup) => void };

function FolderRowImpl({ group, onPress }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const name = group.folder === '' ? t('files.rootFolder') : displayName(group.folder);
  const count = t('files.fileCount', { count: group.count });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count}`}
      onPress={() => onPress(group)}
      style={styles.row}
    >
      <MaterialCommunityIcons name="folder-outline" size={32} color={colors.textMuted} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
          {name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

export const FolderRow = memo(FolderRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 16,
  },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '500' },
  meta: { fontSize: 13 },
});
