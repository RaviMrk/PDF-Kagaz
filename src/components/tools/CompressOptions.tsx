import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import { RunButton } from '@/components/tools/RunButton';
import type { FileRow } from '@/db/schema';
import type { CompressLevel } from '@/services/tools/runTool';
import { knownSize } from '@/services/tools/toolFailure';
import { useTheme } from '@/theme/useTheme';
import { formatBytes } from '@/utils/fileSize';

type Props = { row: FileRow; onRun(level: CompressLevel): void };

const LEVELS: readonly CompressLevel[] = ['low', 'medium', 'high'];

/** Compress options: the level (Medium by default), what it does, and the file's size now. */
export function CompressOptions({ row, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [level, setLevel] = useState<CompressLevel>('medium');
  const size = knownSize(row.sizeBytes);
  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {size > 0 ? (
          <Text style={{ color: colors.textMuted }}>
            {t('compress.inputSize', { size: formatBytes(size) })}
          </Text>
        ) : null}
        <Text style={[styles.label, { color: colors.text }]}>{t('compress.level')}</Text>
        <ChoiceChips<CompressLevel>
          label={t('compress.level')}
          options={LEVELS.map((key) => ({ key, label: t(`compress.${key}`) }))}
          value={level}
          onChange={setLevel}
        />
        <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted }}>
          {t(`compress.${level}Hint`)}
        </Text>
      </ScrollView>
      <RunButton label={t('compress.run')} disabled={false} onPress={() => onRun(level)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  scroll: { flex: 1 },
  content: { gap: 8 },
  label: { fontWeight: '600' },
});
