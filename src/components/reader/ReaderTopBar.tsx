import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

type Props = {
  title: string;
  onClose(): void;
  /** Right-hand actions. */
  children?: ReactNode;
};

export function ReaderTopBar({ title, onClose, children }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.surface, borderColor: colors.border, paddingTop: insets.top },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('reader.close')}
        onPress={onClose}
        style={styles.iconButton}
      >
        <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      <View style={styles.slot}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '600', marginHorizontal: 8 },
  slot: { flexDirection: 'row', alignItems: 'center' },
});
