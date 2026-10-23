import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

type Props = {
  kind: 'image' | 'page';
  /** 1-based position of the selected item, or null. */
  selected: number | null;
  total: number;
  onEarlier(): void;
  onLater(): void;
  onRemove(): void;
};

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

/** Move earlier / later / remove for the selection; render it below the screen's ScrollView. */
export function ImageActionBar({ kind, selected, total, onEarlier, onLater, onRemove }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const prefix = kind === 'image' ? 'images' : 'scan';
  const button = (name: string, icon: Icon, off: boolean, run: () => void) => {
    const disabled = selected === null || off;
    const label =
      selected === null ? t(`${prefix}.${name}None`) : t(`${prefix}.${name}`, { n: selected });
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={run}
        style={[styles.button, disabled && styles.dim]}
      >
        <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      </Pressable>
    );
  };
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface }]}>
      {button('moveEarlier', 'arrow-left', selected === 1, onEarlier)}
      {button('moveLater', 'arrow-right', selected === total, onLater)}
      {button('remove', 'delete-outline', false, onRemove)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', borderRadius: 12 },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
});
