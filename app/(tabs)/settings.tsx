import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import { AdPrivacyRow } from '@/components/settings/AdPrivacyRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SwitchRow } from '@/components/settings/SwitchRow';
import { ScannedFoldersSection } from '@/components/ScannedFoldersSection';
import { appVersion, privacyPolicyUrl } from '@/config/appInfo';
import { resolveLanguage } from '@/i18n';
import { clearAppCache } from '@/services/files/clearCache';
import type { ImageQuality } from '@/services/tools/limits';
import { useFiles } from '@/stores/filesStore';
import { useSettings, type ThemePref } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';
import { useToolJobs } from '@/stores/toolJobStore';
import { useTheme } from '@/theme/useTheme';
import { formatBytes } from '@/utils/fileSize';

const THEMES: { key: ThemePref; labelKey: string }[] = [
  { key: 'system', labelKey: 'settings.themeSystem' },
  { key: 'light', labelKey: 'settings.themeLight' },
  { key: 'dark', labelKey: 'settings.themeDark' },
];

const QUALITIES: { key: ImageQuality; labelKey: string }[] = [
  { key: 'compact', labelKey: 'settings.qualityCompact' },
  { key: 'standard', labelKey: 'settings.qualityStandard' },
  { key: 'high', labelKey: 'settings.qualityHigh' },
];

type LanguageChoice = 'system' | 'en';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const language = useSettings((s) => s.language);
  const imageQuality = useSettings((s) => s.imageQuality);
  const analyticsEnabled = useSettings((s) => s.analyticsEnabled);
  const crashReportsEnabled = useSettings((s) => s.crashReportsEnabled);
  const jobRunning = useToolJobs((s) => s.active !== null);
  const [clearing, setClearing] = useState(false);
  const [cacheResult, setCacheResult] = useState<string | null>(null);
  const mode = useStorage((s) => s.mode);
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
  const chooseLanguage = (choice: LanguageChoice) => {
    useSettings.getState().setLanguage(choice === 'system' ? null : choice);
    const codes = getLocales()
      .map((l) => l.languageCode)
      .filter((c): c is string => c !== null);
    void i18n.changeLanguage(resolveLanguage(choice === 'system' ? null : choice, codes));
  };
  const clearCache = async () => {
    setClearing(true);
    setCacheResult(null);
    const result = await clearAppCache();
    setClearing(false);
    if (result.ok)
      setCacheResult(t('settings.clearCacheDone', { size: formatBytes(result.bytes) }));
    else if (result.reason === 'failed') setCacheResult(t('settings.clearCacheFailed'));
  };
  const { version, build } = appVersion();
  const policyUrl = privacyPolicyUrl();
  const modeKey =
    mode === 'full' ? 'storage.modeFull' : mode === 'saf' ? 'storage.modeSaf' : 'storage.modeNone';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <SettingsSection title={t('settings.sectionAppearance')}>
        <ChoiceChips
          label={t('settings.theme')}
          options={THEMES.map((o) => ({ key: o.key, label: t(o.labelKey) }))}
          value={theme}
          onChange={setTheme}
        />
      </SettingsSection>
      <SettingsSection title={t('settings.language')}>
        <ChoiceChips<LanguageChoice>
          label={t('settings.language')}
          options={[
            { key: 'system', label: t('settings.languageSystem') },
            { key: 'en', label: t('settings.languageEn') },
          ]}
          value={language === 'en' ? 'en' : 'system'}
          onChange={chooseLanguage}
        />
        <Text style={[styles.note, { color: colors.textMuted }]}>{t('settings.languageSoon')}</Text>
      </SettingsSection>
      <SettingsSection title={t('settings.sectionFiles')}>
        <Text style={[styles.label, { color: colors.text }]}>{t('settings.outputFolder')}</Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          {t('settings.outputFolderValue')}
        </Text>
        <Text accessibilityRole="header" style={[styles.subheading, { color: colors.text }]}>
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
            {t('storage.errorSettings')}
          </Text>
        ) : null}
        {mode !== 'full' && mode !== 'unknown' ? <ScannedFoldersSection /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.clearCache')}
          accessibilityState={{ disabled: jobRunning || clearing, busy: clearing }}
          disabled={jobRunning || clearing}
          onPress={() => void clearCache()}
          style={[styles.row, (jobRunning || clearing) && styles.dim]}
        >
          {clearing ? <ActivityIndicator color={colors.primary} /> : null}
          <Text style={[styles.label, { color: colors.primary }]}>{t('settings.clearCache')}</Text>
        </Pressable>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          {jobRunning ? t('settings.clearCacheBusy') : t('settings.clearCacheHint')}
        </Text>
        {cacheResult ? (
          <Text accessibilityLiveRegion="polite" style={[styles.label, { color: colors.text }]}>
            {cacheResult}
          </Text>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t('settings.sectionImages')}>
        <ChoiceChips
          label={t('settings.quality')}
          options={QUALITIES.map((o) => ({ key: o.key, label: t(o.labelKey) }))}
          value={imageQuality}
          onChange={(q) => useSettings.getState().setImageQuality(q)}
        />
        <Text style={[styles.note, { color: colors.textMuted }]}>{t('settings.qualityHint')}</Text>
      </SettingsSection>
      <SettingsSection title={t('settings.sectionPrivacy')}>
        <AdPrivacyRow />
        <SwitchRow
          label={t('settings.analytics')}
          hint={t('settings.analyticsHint')}
          value={analyticsEnabled}
          onValueChange={(on) => useSettings.getState().setAnalyticsEnabled(on)}
        />
        <SwitchRow
          label={t('settings.crashReports')}
          hint={t('settings.crashReportsHint')}
          value={crashReportsEnabled}
          onValueChange={(on) => useSettings.getState().setCrashReportsEnabled(on)}
        />
        <Text style={[styles.note, { color: colors.textMuted }]}>{t('settings.offlineNote')}</Text>
      </SettingsSection>
      <SettingsSection title={t('settings.sectionAbout')}>
        <Text style={[styles.label, { color: colors.text }]}>
          {t('settings.version', { version, build })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.licenses')}
          onPress={() => router.push('/licenses')}
          style={styles.row}
        >
          <Text style={[styles.label, { color: colors.primary }]}>{t('settings.licenses')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.privacyPolicy')}
          accessibilityState={{ disabled: !policyUrl }}
          disabled={!policyUrl}
          onPress={() => policyUrl && void Linking.openURL(policyUrl).catch(() => {})}
          style={[styles.row, !policyUrl && styles.dim]}
        >
          <Text style={[styles.label, { color: colors.primary }]}>
            {t('settings.privacyPolicy')}
          </Text>
          {!policyUrl ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              {t('settings.privacyPolicyMissing')}
            </Text>
          ) : null}
        </Pressable>
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  dim: { opacity: 0.4 },
  subheading: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 16 },
  note: { fontSize: 13 },
});
