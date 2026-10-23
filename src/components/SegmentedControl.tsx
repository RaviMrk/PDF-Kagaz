import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props<K extends string> = {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** Dims and blocks every option. */
  disabled?: boolean;
};

export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: Props<K>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.row, { backgroundColor: colors.surface }, disabled && styles.dim]}
    >
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(o.key)}
            style={[styles.segment, selected && { backgroundColor: colors.primary }]}
          >
            {/* Two lines: "Favourites" must not be cut off at large font scales. */}
            <Text
              numberOfLines={2}
              style={[styles.label, { color: selected ? colors.onPrimary : colors.text }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', borderRadius: 24, padding: 2, flex: 1 },
  segment: {
    flex: 1,
    minHeight: 48,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  label: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
