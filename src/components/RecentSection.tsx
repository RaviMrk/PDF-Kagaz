import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RecentCard } from '@/components/RecentCard';
import type { FileRow } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';

const keyOf = (f: FileRow) => f.id;
const Gap = () => <View style={styles.gap} />;

/** The Recent heading and horizontal card list; hidden when there are no files. */
export function RecentSection({ files }: { files: FileRow[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const openFile = useCallback((f: FileRow) => {
    router.push({ pathname: '/reader/[id]', params: { id: f.id } });
  }, []);

  if (files.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        {t('home.recent')}
      </Text>
      <View style={styles.list}>
        <FlashList
          horizontal
          data={files}
          keyExtractor={keyOf}
          renderItem={({ item }) => <RecentCard file={item} onPress={openFile} />}
          ItemSeparatorComponent={Gap}
          showsHorizontalScrollIndicator={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, alignSelf: 'stretch' },
  heading: { fontSize: 18, fontWeight: '600' },
  list: { height: 220 },
  gap: { width: 12 },
});
