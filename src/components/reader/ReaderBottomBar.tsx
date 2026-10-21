import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

type Props = {
  page: number;
  pageCount: number;
  onPressPage(): void;
  /** Further actions. */
  children?: ReactNode;
};

export function ReaderBottomBar({ page, pageCount, onPressPage, children }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('reader.pageA11y', { page, count: pageCount })}
        onPress={onPressPage}
        style={styles.page}
      >
        <Text style={[styles.pageText, { color: colors.text }]}>
          {t('reader.pageOf', { page, count: pageCount })}
        </Text>
      </Pressable>
      <View style={styles.slot}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  page: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' },
  pageText: { fontSize: 16, fontWeight: '600' },
  slot: { flexDirection: 'row', alignItems: 'center' },
});
