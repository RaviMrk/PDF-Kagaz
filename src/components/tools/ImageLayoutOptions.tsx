import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import type {
  ImageLayoutOptions as Layout,
  MarginOption,
  OrientationOption,
  PageSizeOption,
} from '@/services/pdf/imageLayout';
import { useTheme } from '@/theme/useTheme';

type Props = {
  value: Layout;
  onChange(v: Layout): void;
  name: string;
  /** The default output name without ".pdf". */
  namePlaceholder: string;
  onNameChange(text: string): void;
};

export function ImageLayoutOptions({
  value,
  onChange,
  name,
  namePlaceholder,
  onNameChange,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fit = value.pageSize === 'fit';
  const label = (key: string) => (
    <Text style={[styles.label, { color: colors.text }]}>{t(key)}</Text>
  );
  return (
    <View style={styles.root}>
      {label('layout.pageSize')}
      <ChoiceChips<PageSizeOption>
        label={t('layout.pageSize')}
        options={[
          { key: 'a4', label: t('layout.a4') },
          { key: 'letter', label: t('layout.letter') },
          { key: 'fit', label: t('layout.fit') },
        ]}
        value={value.pageSize}
        onChange={(pageSize) => onChange({ ...value, pageSize })}
      />
      {label('layout.orientation')}
      <ChoiceChips<OrientationOption>
        label={t('layout.orientation')}
        options={[
          { key: 'auto', label: t('layout.auto') },
          { key: 'portrait', label: t('layout.portrait') },
          { key: 'landscape', label: t('layout.landscape') },
        ]}
        value={value.orientation}
        disabled={fit}
        onChange={(orientation) => onChange({ ...value, orientation })}
      />
      {fit ? <Text style={{ color: colors.textMuted }}>{t('layout.fitHint')}</Text> : null}
      {label('layout.margins')}
      <ChoiceChips<MarginOption>
        label={t('layout.margins')}
        options={[
          { key: 'none', label: t('layout.marginNone') },
          { key: 'small', label: t('layout.marginSmall') },
          { key: 'large', label: t('layout.marginLarge') },
        ]}
        value={value.margin}
        onChange={(margin) => onChange({ ...value, margin })}
      />
      {label('layout.name')}
      <TextInput
        accessibilityLabel={t('layout.name')}
        value={name}
        onChangeText={onNameChange}
        placeholder={namePlaceholder}
        placeholderTextColor={colors.textMuted}
        maxLength={120}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  label: { fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 },
});
