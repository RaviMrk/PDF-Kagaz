import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PermissionGate } from '@/components/PermissionGate';
import { QuickToolsGrid } from '@/components/QuickToolsGrid';
import { ActiveJobCard } from '@/components/tools/ActiveJobCard';
import { RecentSection } from '@/components/RecentSection';
import { SearchBar } from '@/components/SearchBar';
import { recentFiles } from '@/services/files/fileQuery';
import type { ToolDef } from '@/services/tools/toolRegistry';
import { useFiles } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';

// A fresh value per tap: the Files tab stays mounted, so a constant param would not refocus.
let focusNonce = 0;
const nextFocusNonce = () => `${Date.now()}-${++focusNonce}`;

function HomeContent() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const files = useFiles((s) => s.files);
  const recent = useMemo(() => recentFiles(files, 10), [files]);

  const openTool = useCallback((tool: ToolDef) => router.push(tool.href), []);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <SearchBar
        placeholder={t('home.searchHint')}
        onPress={() => router.navigate({ pathname: '/files', params: { focus: nextFocusNonce() } })}
      />
      <ActiveJobCard />
      <RecentSection files={recent} />
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
          {t('home.tools')}
        </Text>
        <QuickToolsGrid onSelect={openTool} />
      </View>
    </ScrollView>
  );
}

/** Without storage access, only files opened from other apps or made here can be listed. */
function OpenedWithoutAccess() {
  const files = useFiles((s) => s.files);
  const opened = useMemo(
    () =>
      recentFiles(
        files.filter(
          (f) => (f.source === 'intent' || f.source === 'output') && f.lastOpenedAt != null,
        ),
        10,
      ),
    [files],
  );
  return (
    <View style={styles.content}>
      <ActiveJobCard />
      <RecentSection files={opened} />
    </View>
  );
}

export default function Screen() {
  return (
    <PermissionGate withoutAccess={<OpenedWithoutAccess />}>
      <HomeContent />
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  heading: { fontSize: 18, fontWeight: '600' },
});
