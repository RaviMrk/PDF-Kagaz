import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props = {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  /** Dimmed and inert; the value shown is what actually happens. */
  disabled?: boolean;
};

/** A labelled on/off row. The whole row is the accessible switch; the Switch shows its state. */
export function SwitchRow({ label, hint, value, onValueChange, disabled = false }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      style={[styles.row, disabled && styles.disabled]}
    >
      <View style={styles.text}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      </View>
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  text: { flex: 1 },
  disabled: { opacity: 0.5 },
  label: { fontSize: 16 },
  hint: { fontSize: 13 },
});
