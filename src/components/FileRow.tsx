import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PdfThumbnail } from '@/components/PdfThumbnail';
import type { FileRow as FileRowData } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';
import { formatDate } from '@/utils/date';
import { formatBytes } from '@/utils/fileSize';

type Props = {
  file: FileRowData;
  onPress: (file: FileRowData) => void;
  onMore: (file: FileRowData) => void;
};

function FileRowImpl({ file, onPress, onMore }: Props) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const parts = [formatBytes(file.sizeBytes), formatDate(file.modifiedAt, i18n.language)];
  if (file.pageCount != null) parts.push(t('files.pages', { count: file.pageCount }));
  const meta = parts.join(' · ');

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${file.name}, ${meta}`}
        onPress={() => onPress(file)}
        style={styles.main}
      >
        <PdfThumbnail file={file} width={48} height={64} />
        <View style={styles.text}>
          <Text
            testID="file-row-name"
            numberOfLines={2}
            style={[styles.name, { color: colors.text }]}
          >
            {file.name}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('files.moreActions', { name: file.name })}
        onPress={() => onMore(file)}
        style={styles.more}
      >
        <MaterialCommunityIcons name="dots-vertical" size={24} color={colors.text} />
      </Pressable>
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
