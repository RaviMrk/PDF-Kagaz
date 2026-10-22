import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props = { label: string; disabled: boolean; onPress(): void };

/** The primary action at the bottom of a tool's options step. */
export function RunButton({ label, disabled, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.run, { backgroundColor: colors.primary }, disabled && styles.dim]}
    >
      <Text style={[styles.text, { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  run: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, fontWeight: '600' },
  dim: { opacity: 0.5 },
});
