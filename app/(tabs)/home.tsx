import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PermissionGate } from '@/components/PermissionGate';
import { QuickToolsGrid, type QuickTool } from '@/components/QuickToolsGrid';
import { RecentCard } from '@/components/RecentCard';
import { SearchBar } from '@/components/SearchBar';
import type { FileRow } from '@/db/schema';
import { recentFiles } from '@/services/files/fileQuery';
import { useFiles } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';

const keyOf = (f: FileRow) => f.id;
const Gap = () => <View style={styles.gap} />;

function HomeContent() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const files = useFiles((s) => s.files);
  const recent = useMemo(() => recentFiles(files, 10), [files]);

  const openFile = useCallback((f: FileRow) => {
    useFiles.getState().markOpened(f.id);
    router.push(`/reader/${f.id}`);
  }, []);
  const openTool = useCallback((tool: QuickTool) => router.push(tool.href as never), []);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <SearchBar
        placeholder={t('home.searchHint')}
        onPress={() => router.navigate({ pathname: '/files', params: { focus: 'search' } })}
      />
      {recent.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
            {t('home.recent')}
          </Text>
          <View style={styles.recentList}>
            <FlashList
              horizontal
              data={recent}
              keyExtractor={keyOf}
              renderItem={({ item }) => <RecentCard file={item} onPress={openFile} />}
              ItemSeparatorComponent={Gap}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        </View>
      ) : null}
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
          {t('home.tools')}
        </Text>
        <QuickToolsGrid onSelect={openTool} />
      </View>
    </ScrollView>
  );
}

export default function Screen() {
  return (
    <PermissionGate>
      <HomeContent />
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  heading: { fontSize: 18, fontWeight: '600' },
  recentList: { height: 220 },
  gap: { width: 12 },
});
