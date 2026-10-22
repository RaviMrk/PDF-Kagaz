import { StyleSheet, View } from 'react-native';

import { ToolCard } from '@/components/tools/ToolCard';
import { QUICK_TOOL_IDS, toolById, type ToolDef } from '@/services/tools/toolRegistry';

const QUICK_TOOLS = QUICK_TOOL_IDS.map(toolById).filter((t): t is ToolDef => t !== null);

export function QuickToolsGrid({ onSelect }: { onSelect(tool: ToolDef): void }) {
  return (
    <View style={styles.grid}>
      {QUICK_TOOLS.map((tool) => (
        <View key={tool.id} style={styles.cell}>
          <ToolCard tool={tool} onPress={onSelect} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '47%', flexGrow: 1 },
});
