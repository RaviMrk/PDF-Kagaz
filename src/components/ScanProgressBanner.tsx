import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

export function ScanProgressBanner({ count }: { count: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: colors.surface }]}>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
        {t('files.scanning', { count })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
});
