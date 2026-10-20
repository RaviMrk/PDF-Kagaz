import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { StorageAccessCard } from '@/components/StorageAccessCard';
import { useSettings } from '@/stores/settingsStore';
import { useTheme } from '@/theme/useTheme';

const LAST = 2;

export default function Onboarding() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const setOnboardingDone = useSettings((s) => s.setOnboardingDone);
  const [index, setIndex] = useState(0);

  const finish = () => {
    setOnboardingDone(true);
    router.replace('/home');
  };

  const title =
    index === 0
      ? t('onboarding.slide1Title')
      : index === 1
        ? t('onboarding.slide2Title')
        : t('onboarding.slide3Title');
  const body =
    index === 0 ? t('onboarding.slide1Body') : index === 1 ? t('onboarding.slide2Body') : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        {body ? <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text> : null}
        {index === LAST ? <StorageAccessCard onDone={finish} /> : null}
      </View>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: i === index ? colors.primary : colors.border }]}
          />
        ))}
      </View>
      <View style={styles.footer}>
        {index < LAST ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skip')}
              onPress={() => setIndex(LAST)}
              style={styles.textButton}
            >
              <Text style={[styles.buttonText, { color: colors.textMuted }]}>
                {t('onboarding.skip')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.next')}
              onPress={() => setIndex((i) => i + 1)}
              style={[styles.textButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
                {t('onboarding.next')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.notNow')}
            onPress={finish}
            style={styles.textButton}
          >
            <Text style={[styles.buttonText, { color: colors.textMuted }]}>
              {t('onboarding.notNow')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 16, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  textButton: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
