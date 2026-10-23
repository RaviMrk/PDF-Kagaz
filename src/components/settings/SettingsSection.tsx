import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props = { title: string; children: ReactNode };

/** A titled group of settings rows. */
export function SettingsSection({ title, children }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24, gap: 8 },
  heading: { fontSize: 16, fontWeight: '600' },
});
