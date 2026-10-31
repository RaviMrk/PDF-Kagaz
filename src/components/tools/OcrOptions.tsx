import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RunButton } from '@/components/tools/RunButton';
import type { FileRow } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';

type Props = { row: FileRow; onRun(): void };

/** Make searchable options: nothing to choose, only what the tool does and one Run. */
export function OcrOptions({ row, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={{ color: colors.textMuted }}>{displayName(row.name)}</Text>
        <Text style={{ color: colors.textMuted }}>{t('ocr.intro')}</Text>
        <Text style={{ color: colors.textMuted }}>{t('ocr.languages')}</Text>
        <Text style={{ color: colors.textMuted }}>{t('ocr.skipNote')}</Text>
        <Text style={{ color: colors.textMuted }}>{t('ocr.privacy')}</Text>
      </ScrollView>
      <RunButton label={t('ocr.run')} disabled={false} onPress={onRun} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  scroll: { flex: 1 },
  content: { gap: 12 },
});
