import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/SegmentedControl';
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
      <View style={styles.row}>
        <SegmentedControl<PageSizeOption>
          options={[
            { key: 'a4', label: t('layout.a4') },
            { key: 'letter', label: t('layout.letter') },
            { key: 'fit', label: t('layout.fit') },
          ]}
          value={value.pageSize}
          onChange={(pageSize) => onChange({ ...value, pageSize })}
        />
      </View>
      {label('layout.orientation')}
      <View style={styles.row}>
        <SegmentedControl<OrientationOption>
          options={[
            { key: 'auto', label: t('layout.auto') },
            { key: 'portrait', label: t('layout.portrait') },
            { key: 'landscape', label: t('layout.landscape') },
          ]}
          value={value.orientation}
          disabled={fit}
          onChange={(orientation) => onChange({ ...value, orientation })}
        />
      </View>
      {fit ? <Text style={{ color: colors.textMuted }}>{t('layout.fitHint')}</Text> : null}
      {label('layout.margins')}
      <View style={styles.row}>
        <SegmentedControl<MarginOption>
          options={[
            { key: 'none', label: t('layout.marginNone') },
            { key: 'small', label: t('layout.marginSmall') },
            { key: 'large', label: t('layout.marginLarge') },
          ]}
          value={value.margin}
          onChange={(margin) => onChange({ ...value, margin })}
        />
      </View>
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
  row: { flexDirection: 'row' },
  label: { fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 },
});
