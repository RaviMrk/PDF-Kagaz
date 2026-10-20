import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PdfThumbnail } from '@/components/PdfThumbnail';
import type { FileRow } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';
import { formatDate } from '@/utils/date';

type Props = { file: FileRow; onPress: (file: FileRow) => void };

function RecentCardImpl({ file, onPress }: Props) {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const date = formatDate(file.modifiedAt, i18n.language);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${file.name}, ${date}`}
      onPress={() => onPress(file)}
      style={styles.card}
    >
      <PdfThumbnail file={file} width={120} height={150} />
      <Text
        testID="recent-card-name"
        numberOfLines={2}
        style={[styles.name, { color: colors.text }]}
      >
        {file.name}
      </Text>
      <Text style={[styles.date, { color: colors.textMuted }]}>{date}</Text>
    </Pressable>
  );
}

export const RecentCard = memo(RecentCardImpl);

const styles = StyleSheet.create({
  card: { width: 120, gap: 4 },
  name: { fontSize: 14, fontWeight: '500' },
  date: { fontSize: 12 },
});
