import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ToolCard } from '@/components/tools/ToolCard';
import { toolsByGroup, type ToolDef } from '@/services/tools/toolRegistry';
import { useTheme } from '@/theme/useTheme';

const GROUPS = toolsByGroup();
const openTool = (tool: ToolDef) => router.push(tool.href);

export default function Screen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {GROUPS.map(({ group, tools }) => (
        <View key={group} style={styles.section}>
          <Text
            testID="tool-group-header"
            accessibilityRole="header"
            style={[styles.heading, { color: colors.text }]}
          >
            {t(`tools.group.${group}`)}
          </Text>
          <View style={styles.grid}>
            {tools.map((tool) => (
              <View key={tool.id} testID="tool-card" style={styles.cell}>
                <ToolCard tool={tool} onPress={openTool} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  heading: { fontSize: 18, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '47%', flexGrow: 1 },
});
