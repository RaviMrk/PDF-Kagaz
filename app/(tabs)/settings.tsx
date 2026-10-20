import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSettings, type ThemePref } from '@/stores/settingsStore';
import { useTheme } from '@/theme/useTheme';

const OPTIONS: { value: ThemePref; labelKey: string }[] = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        {t('settings.theme')}
      </Text>
      <View accessibilityRole="radiogroup">
        {OPTIONS.map(({ value, labelKey }) => {
          const checked = theme === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={t(labelKey)}
              accessibilityState={{ checked }}
              onPress={() => setTheme(value)}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <View
                style={[styles.radio, { borderColor: checked ? colors.primary : colors.border }]}
              >
                {checked ? (
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                ) : null}
              </View>
              <Text style={[styles.label, { color: colors.text }]}>{t(labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 16 },
});
