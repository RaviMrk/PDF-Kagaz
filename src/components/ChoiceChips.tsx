import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props<K extends string> = {
  /** The visible field label; names the radio group for screen readers. */
  label: string;
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** Dims and blocks every chip. */
  disabled?: boolean;
  /** One line of chips that scrolls sideways when it does not fit, instead of wrapping. */
  scroll?: boolean;
};

/**
 * A single choice as a row of chips. Each chip is as wide as its label, which stays on one line
 * and is never cut: a chip that does not fit moves whole to the next row (large font scales), or
 * with `scroll` the row scrolls sideways.
 */
export function ChoiceChips<K extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  scroll = false,
}: Props<K>) {
  const { colors } = useTheme();
  const group = (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.row, scroll ? styles.oneLine : styles.wrap, disabled && styles.dim]}
    >
      {options.map((o) => {
        const checked = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => onChange(o.key)}
            style={[
              styles.chip,
              checked
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, { color: checked ? colors.onPrimary : colors.text }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (!scroll) return group;
  return (
    <ScrollView
      testID="choice-chips-scroll"
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {group}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexWrap: 'wrap' },
  oneLine: { flexWrap: 'nowrap' },
  chip: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '600' },
});
