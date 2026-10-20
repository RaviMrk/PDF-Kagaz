import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props<K extends string> = {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
};

export function SegmentedControl<K extends string>({ options, value, onChange }: Props<K>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.row, { backgroundColor: colors.surface }]}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.key)}
            style={[styles.segment, selected && { backgroundColor: colors.primary }]}
          >
            <Text
              numberOfLines={1}
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
  row: { flexDirection: 'row', borderRadius: 24, padding: 2, flex: 1 },
  segment: {
    flex: 1,
    minHeight: 48,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  label: { fontSize: 14, fontWeight: '600' },
});
