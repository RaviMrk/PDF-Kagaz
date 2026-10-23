import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/BottomSheet';
import type { FileRow } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';
import { formatDate } from '@/utils/date';
import { displayName } from '@/utils/displayName';
import { formatBytes } from '@/utils/fileSize';

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Readable location: a file path when the folder is a file:// uri, else the folder name. */
function locationOf(file: FileRow): string {
  const parent = file.parentUri;
  if (parent?.startsWith('file://')) return safeDecode(parent.slice('file://'.length));
  return file.folder;
}

export function FileInfoSheet({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const rows: [string, string][] = [
    [t('files.infoName'), displayName(file.name)],
    [t('files.infoFolder'), file.folder === '' ? t('files.rootFolder') : file.folder],
    [t('files.infoSize'), formatBytes(file.sizeBytes)],
    [t('files.infoModified'), formatDate(file.modifiedAt, i18n.language)],
    [t('files.infoPages'), file.pageCount != null ? String(file.pageCount) : '—'],
    [t('files.infoLocation'), locationOf(file)],
  ];
  return (
    <BottomSheet
      onRequestClose={onClose}
      onScrimPress={onClose}
      scrimLabel={t('files.close')}
      gap={8}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {t('files.info')}
      </Text>
      {rows.map(([label, value]) => (
        <View key={label} accessible style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
          <Text selectable style={[styles.value, { color: colors.text }]}>
            {value}
          </Text>
        </View>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  row: { gap: 2, minHeight: 48, justifyContent: 'center' },
  label: { fontSize: 12 },
  value: { fontSize: 16 },
});
