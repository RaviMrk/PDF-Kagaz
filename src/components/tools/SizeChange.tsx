import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';
import { formatBytes } from '@/utils/fileSize';

type Props = { before: number; after: number };

/** A compressed file's size against the original's; a warning when it did not get smaller. */
export function SizeChange({ before, after }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sizes = { before: formatBytes(before), after: formatBytes(after) };
  const smaller = after < before;
  const text = smaller
    ? t('compress.sizeChange', {
        ...sizes,
        percent: Math.round((1 - after / before) * 100),
      })
    : t('compress.larger', sizes);
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: smaller ? colors.text : colors.danger }]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, fontWeight: '600' },
});
