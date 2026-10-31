import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ToolExtras } from '@/services/tools/runTool';
import { useTheme } from '@/theme/useTheme';

type Props = { ocr: NonNullable<ToolExtras['ocr']> };

/** Pages with text added, pages left as they were, and pages where nothing was found. */
export function OcrSummary({ ocr }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lines = [
    ocr.pagesWithText > 0 ? t('ocr.pagesDone', { count: ocr.pagesWithText }) : null,
    ocr.pagesSkipped > 0 ? t('ocr.pagesSkipped', { count: ocr.pagesSkipped }) : null,
    ocr.pagesNoText > 0 ? t('ocr.pagesNoText', { count: ocr.pagesNoText }) : null,
  ].filter((line): line is string => line !== null);
  return (
    <View style={styles.root}>
      {lines.map((line, i) => (
        <Text
          key={line}
          accessibilityLiveRegion={i === 0 ? 'polite' : undefined}
          style={{ color: colors.text }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: 4 } });
