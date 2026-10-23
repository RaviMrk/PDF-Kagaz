import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import type { ImageFilter } from '@/services/native/pdfNative';
import { useTheme } from '@/theme/useTheme';

type Props = { value: ImageFilter; onChange(f: ImageFilter): void };

export function ImageFilterControl({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: colors.text }]}>{t('scan.filter')}</Text>
      <ChoiceChips<ImageFilter>
        label={t('scan.filter')}
        options={[
          { key: 'colour', label: t('scan.filterColour') },
          { key: 'greyscale', label: t('scan.filterGreyscale') },
          { key: 'bw', label: t('scan.filterBw') },
        ]}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  label: { fontWeight: '600' },
});
