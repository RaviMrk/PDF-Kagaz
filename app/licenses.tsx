import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
type Entry = (typeof licenses)[number];

/** The texts are a large asset: loaded only when an entry is opened, never at startup. */
function textFor(entry: Entry): string | null {
  const texts: Record<string, string> = require('@/config/licenseTexts.json');
  return texts[entry.text] ?? null;
}

export default function LicensesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [selected, setSelected] = useState<Entry | null>(null);

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
          {selected ? `${selected.name} ${selected.version}` : t('licenses.title')}
        </Text>
      </View>
      {selected ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('licenses.backToList')}
            onPress={() => setSelected(null)}
            style={styles.back}
          >
            <Text style={[styles.backText, { color: colors.primary }]}>
              {t('licenses.backToList')}
            </Text>
          </Pressable>
          <ScrollView contentContainerStyle={styles.list}>
            <Text selectable style={[styles.text, { color: colors.text }]}>
              {textFor(selected) ?? t('licenses.textMissing')}
            </Text>
          </ScrollView>
        </>
      ) : (
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
                  {t('licenses.itemNoVersion', { name: n.name, license: n.license })}
                </Text>
              ))}
              <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
                {t('licenses.js')}
              </Text>
            </View>
          }
          renderItem={({ item: l }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('licenses.open', { name: l.name, version: l.version })}
              onPress={() => setSelected(l)}
              style={styles.itemRow}
            >
              <Text style={[styles.item, { color: colors.textMuted }]}>
                {t('licenses.item', { name: l.name, version: l.version, license: l.license })}
              </Text>
            </Pressable>
          )}
        />
      )}
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
  item: { fontSize: 14, paddingVertical: 6 },
  itemRow: { minHeight: 48, justifyContent: 'center' },
  text: { fontSize: 12, fontFamily: 'monospace' },
});
