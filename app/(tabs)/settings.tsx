import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScannedFoldersSection } from '@/components/ScannedFoldersSection';
import { useFiles } from '@/stores/filesStore';
import { useSettings, type ThemePref } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';
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
  const mode = useStorage((s) => s.mode);
  const roots = useStorage((s) => s.roots);
  const canRequestFullAccess = useStorage((s) => s.canRequestFullAccess);
  const [grantFailed, setGrantFailed] = useState(false);
  const grantAll = async () => {
    setGrantFailed(false);
    try {
      if (await useStorage.getState().requestFullAccess()) void useFiles.getState().refresh('full');
    } catch {
      setGrantFailed(true);
    }
  };
  const modeKey =
    mode === 'full' ? 'storage.modeFull' : mode === 'saf' ? 'storage.modeSaf' : 'storage.modeNone';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
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
      <Text
        accessibilityRole="header"
        style={[styles.heading, styles.section, { color: colors.text }]}
      >
        {t('storage.title')}
      </Text>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t(modeKey)}</Text>
      {mode !== 'full' && mode !== 'unknown' && canRequestFullAccess ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('storage.grantAll')}
          onPress={() => void grantAll()}
          style={styles.row}
        >
          <Text style={[styles.label, { color: colors.primary }]}>{t('storage.grantAll')}</Text>
        </Pressable>
      ) : null}
      {grantFailed ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {t('storage.error')}
        </Text>
      ) : null}
      {mode === 'saf' || (mode === 'none' && roots.length > 0) ? <ScannedFoldersSection /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  section: { marginTop: 24 },
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
