import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PdfThumbnail } from '@/components/PdfThumbnail';
import type { FileRow as FileRowData } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';
import { formatDate } from '@/utils/date';
import { formatBytes } from '@/utils/fileSize';
import { displayName } from '@/utils/displayName';

type Props = {
  file: FileRowData;
  onPress: (file: FileRowData) => void;
  onMore: (file: FileRowData) => void;
  onLongPress?: (file: FileRowData) => void;
  selectionMode?: boolean;
  selected?: boolean;
};

function FileRowImpl({ file, onPress, onMore, onLongPress, selectionMode, selected }: Props) {
  const { t, i18n } = useTranslation();
  const shown = displayName(file.name);
  const { colors } = useTheme();
  const parts = [formatBytes(file.sizeBytes), formatDate(file.modifiedAt, i18n.language)];
  if (file.pageCount != null) parts.push(t('files.pages', { count: file.pageCount }));
  const meta = parts.join(' · ');
  const flags: string[] = [];
  if (file.isFavorite) flags.push(t('files.favoriteMark'));
  if (file.isEncrypted) flags.push(t('files.lockedFile'));
  if (file.isCorrupt) flags.push(t('files.brokenFile'));

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[shown, meta, ...flags].join(', ')}
        onPress={() => onPress(file)}
        onLongPress={selectionMode ? undefined : () => onLongPress?.(file)}
        accessibilityState={selectionMode ? { selected: !!selected } : undefined}
        accessibilityActions={
          selectionMode || !onLongPress
            ? undefined
            : [{ name: 'longpress', label: t('files.select') }]
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'longpress') onLongPress?.(file);
        }}
        style={styles.main}
      >
        <PdfThumbnail file={file} width={48} height={64} />
        <View style={styles.text}>
          <Text
            testID="file-row-name"
            numberOfLines={2}
            style={[styles.name, { color: colors.text }]}
          >
            {shown}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.textMuted }]}>
            {meta}
          </Text>
        </View>
        {file.isFavorite ? (
          <MaterialCommunityIcons
            name="star"
            size={20}
            color={colors.primary}
            accessibilityLabel={t('files.favoriteMark')}
          />
        ) : null}
      </Pressable>
      {selectionMode ? (
        <View style={styles.more} importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons
            name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={selected ? colors.primary : colors.text}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('files.moreActions', { name: shown })}
          onPress={() => onMore(file)}
          style={styles.more}
        >
          <MaterialCommunityIcons name="dots-vertical" size={24} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

export const FileRow = memo(FileRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingLeft: 16 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '500' },
  meta: { fontSize: 13 },
  more: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
