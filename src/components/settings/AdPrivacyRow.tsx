import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAds } from '@/services/ads/adsStore';
import { useTheme } from '@/theme/useTheme';

/** "Ad privacy choices": shown only where the consent framework requires it. */
export function AdPrivacyRow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const required = useAds((s) => s.privacyOptionsRequired);
  const [failed, setFailed] = useState(false);
  if (!required) return null;
  const open = async () => {
    setFailed(false);
    if (!(await useAds.getState().openPrivacyOptions())) setFailed(true);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.adPrivacy')}
        onPress={() => void open()}
        style={styles.row}
      >
        <Text style={[styles.label, { color: colors.primary }]}>{t('settings.adPrivacy')}</Text>
      </Pressable>
      {failed ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {t('settings.adPrivacyFailed')}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, justifyContent: 'center' },
  label: { fontSize: 16 },
});
