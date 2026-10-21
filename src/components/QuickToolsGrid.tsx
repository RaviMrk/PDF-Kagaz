import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

export type QuickTool = {
  key: 'scan' | 'merge' | 'compress' | 'imagesToPdf';
  icon: Icon;
  href: Href;
};

export const QUICK_TOOLS: QuickTool[] = [
  { key: 'scan', icon: 'camera-outline', href: '/scan' },
  {
    key: 'merge',
    icon: 'file-multiple-outline',
    href: { pathname: '/tool/[toolId]', params: { toolId: 'merge' } },
  },
  {
    key: 'compress',
    icon: 'arrow-collapse-all',
    href: { pathname: '/tool/[toolId]', params: { toolId: 'compress' } },
  },
  {
    key: 'imagesToPdf',
    icon: 'image-multiple-outline',
    href: { pathname: '/tool/[toolId]', params: { toolId: 'images-to-pdf' } },
  },
];

export function QuickToolsGrid({ onSelect }: { onSelect: (tool: QuickTool) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {QUICK_TOOLS.map((tool) => (
        <Pressable
          key={tool.key}
          accessibilityRole="button"
          accessibilityLabel={t(`tools.${tool.key}`)}
          onPress={() => onSelect(tool)}
          style={[styles.tile, { backgroundColor: colors.surface }]}
        >
          <MaterialCommunityIcons name={tool.icon} size={32} color={colors.primary} />
          <Text style={[styles.label, { color: colors.text }]}>{t(`tools.${tool.key}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { fontSize: 14, fontWeight: '600' },
});
