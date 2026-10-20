import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SortDir, SortKey } from '@/services/files/fileQuery';
import { useTheme } from '@/theme/useTheme';

type Props = {
  sortKey: SortKey;
  sortDir: SortDir;
  onChange: (key: SortKey, dir: SortDir) => void;
};

const KEYS = [
  ['name', 'files.sortName'],
  ['date', 'files.sortDate'],
  ['size', 'files.sortSize'],
] as const;
const DIRS = [
  ['asc', 'files.sortAsc'],
  ['desc', 'files.sortDesc'],
] as const;

export function SortMenu({ sortKey, sortDir, onChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const option = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={styles.option}
    >
      <MaterialCommunityIcons
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={24}
        color={selected ? colors.primary : colors.textMuted}
      />
      <Text style={[styles.optionText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('files.sortBy')}
        onPress={() => setOpen(true)}
        style={styles.button}
      >
        <MaterialCommunityIcons name="sort" size={24} color={colors.text} />
      </Pressable>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel={t('files.cancel')}
          onPress={() => setOpen(false)}
          style={styles.backdrop}
        />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('files.sortBy')}
          </Text>
          {KEYS.map(([key, label]) =>
            option(t(label), key === sortKey, () => onChange(key, sortDir)),
          )}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {DIRS.map(([dir, label]) =>
            option(t(label), dir === sortDir, () => onChange(sortKey, dir)),
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  optionText: { fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
