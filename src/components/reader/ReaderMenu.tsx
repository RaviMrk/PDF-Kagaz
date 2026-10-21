import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { ReaderAction } from '@/services/reader/readerActions';
import type { ReaderTheme } from '@/stores/settingsStore';
import { useTheme } from '@/theme/useTheme';

type Props = {
  visible: boolean;
  theme: ReaderTheme;
  keepAwake: boolean;
  horizontal: boolean;
  onTheme(t: ReaderTheme): void;
  onKeepAwake(on: boolean): void;
  onHorizontal(on: boolean): void;
  onAction(a: ReaderAction): void;
  onClose(): void;
};

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

const THEMES = [
  ['normal', 'reader.themeNormal'],
  ['night', 'reader.themeNight'],
  ['sepia', 'reader.themeSepia'],
] as const;

const ACTIONS: readonly (readonly [ReaderAction, string, Icon])[] = [
  ['share', 'reader.share', 'share-variant'],
  ['print', 'reader.print', 'printer'],
  ['openWith', 'reader.openWith', 'open-in-app'],
];

/** Reader overflow menu: page colour, keep screen on, sideways paging and file actions. */
export function ReaderMenu({
  visible,
  theme,
  keepAwake,
  horizontal,
  onTheme,
  onKeepAwake,
  onHorizontal,
  onAction,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const toggleRow = (label: string, value: boolean, onChange: (on: boolean) => void) => (
    <Pressable
      key={label}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.row}
    >
      <Text style={[styles.rowText, { color: colors.text }]}>{label}</Text>
      {/* The row is the accessible control; the switch is its visual state. */}
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
    </Pressable>
  );

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('reader.close')} onPress={onClose} style={styles.backdrop} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: 16 + insets.bottom },
        ]}
      >
        <ScrollView>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('reader.appearance')}
          </Text>
          {THEMES.map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={t(label)}
              accessibilityState={{ checked: key === theme }}
              onPress={() => onTheme(key)}
              style={styles.row}
            >
              <MaterialCommunityIcons
                name={key === theme ? 'radiobox-marked' : 'radiobox-blank'}
                size={24}
                color={key === theme ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.rowText, { color: colors.text }]}>{t(label)}</Text>
            </Pressable>
          ))}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {toggleRow(t('reader.keepAwake'), keepAwake, onKeepAwake)}
          {toggleRow(t('reader.horizontal'), horizontal, onHorizontal)}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {ACTIONS.map(([action, label, icon]) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={t(label)}
              onPress={() => onAction(action)}
              style={styles.row}
            >
              <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
              <Text style={[styles.rowText, { color: colors.text }]}>{t(label)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '80%',
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  rowText: { flex: 1, fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
