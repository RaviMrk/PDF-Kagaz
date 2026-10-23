import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import licenses from '@/config/licenses.json';
import { NATIVE_NOTICES } from '@/config/nativeNotices';
import { useTheme } from '@/theme/useTheme';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

/**
 * The short Android list is the list header; the long generated JavaScript list is virtualised.
 * Licence data is legal text and is not translated.
 */
export default function LicensesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const item = (name: string, version: string, license: string) =>
    t('licenses.item', { name, version, license }).replace('  ', ' ');

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('licenses.back')}
          onPress={leave}
          style={styles.back}
        >
          <Text style={[styles.backText, { color: colors.primary }]}>{t('licenses.back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('licenses.title')}
        </Text>
      </View>
      <FlashList
        data={licenses}
        keyExtractor={(l) => `${l.name}@${l.version}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
              {t('licenses.native')}
            </Text>
            {NATIVE_NOTICES.map((n) => (
              <Text key={n.name} style={[styles.item, { color: colors.textMuted }]}>
                {item(n.name, '', n.license)}
              </Text>
            ))}
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
              {t('licenses.js')}
            </Text>
          </View>
        }
        renderItem={({ item: l }) => (
          <Text style={[styles.item, { color: colors.textMuted }]}>
            {item(l.name, l.version, l.license)}
          </Text>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  back: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 8 },
  backText: { fontSize: 16 },
  title: { fontSize: 20, fontWeight: '600', flexShrink: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  heading: { fontSize: 16, fontWeight: '600', paddingTop: 16, paddingBottom: 8 },
  item: { fontSize: 14, minHeight: 32, paddingVertical: 6 },
});
