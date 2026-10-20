import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props = {
  placeholder: string;
  /** Without `value`/`onChangeText` the bar renders as a button (Home) that calls `onPress`. */
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  autoFocus?: boolean;
  /** Changing this to a new truthy value focuses the input (tab screens stay mounted). */
  focusSignal?: string | null;
};

export function SearchBar({
  placeholder,
  value,
  onChangeText,
  onPress,
  autoFocus,
  focusSignal,
}: Props) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (focusSignal) input.current?.focus();
  }, [focusSignal]);

  const icon = <MaterialCommunityIcons name="magnify" size={24} color={colors.textMuted} />;
  const box = [styles.box, { backgroundColor: colors.surface, borderColor: colors.border }];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        onPress={onPress}
        style={box}
      >
        {icon}
        <Text style={[styles.hint, { color: colors.textMuted }]}>{placeholder}</Text>
      </Pressable>
    );
  }
  return (
    <View style={box}>
      {icon}
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        style={[styles.input, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: { flex: 1, fontSize: 16, minHeight: 48 },
  hint: { fontSize: 16 },
});
