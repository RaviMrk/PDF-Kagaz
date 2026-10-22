import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Dispatch } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { OrganizeAction, OrganizePage } from '@/services/tools/organizeState';
import { useTheme } from '@/theme/useTheme';

type Props = {
  /** The selected page, or null when nothing is selected. */
  page: OrganizePage | null;
  position: number;
  count: number;
  dispatch: Dispatch<OrganizeAction>;
};

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

/** One bar of actions for the selected page, instead of five buttons on every tile. */
export function OrganizeActionBar({ page, position, count, dispatch }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const shown = page ? String(page.source) : '';
  const button = (name: string, icon: Icon, action: OrganizeAction | null, off = false) => {
    const disabled = page === null || off;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(`organize.${name}`, { page: shown })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => action && dispatch(action)}
        style={[styles.button, disabled && styles.dim]}
      >
        <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      </Pressable>
    );
  };
  const key = page?.key ?? '';
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface }]}>
      {button('rotate', 'rotate-right', { type: 'rotate', key })}
      {button('duplicate', 'content-copy', { type: 'duplicate', key })}
      {button('delete', 'delete-outline', { type: 'delete', key }, count <= 1)}
      {button('moveEarlier', 'arrow-left', { type: 'move', key, delta: -1 }, position <= 1)}
      {button('moveLater', 'arrow-right', { type: 'move', key, delta: 1 }, position >= count)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', borderRadius: 12 },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
});
