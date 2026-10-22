import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ToolDef } from '@/services/tools/toolRegistry';
import { useTheme } from '@/theme/useTheme';

type Props = { tool: ToolDef; onPress(tool: ToolDef): void };

export function ToolCard({ tool, onPress }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const name = t(tool.labelKey);
  const unavailable = !tool.available;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unavailable ? t('tools.comingSoonA11y', { name }) : name}
      accessibilityState={unavailable ? { disabled: true } : undefined}
      onPress={() => {
        if (!unavailable) onPress(tool);
      }}
      style={[styles.card, { backgroundColor: colors.surface }, unavailable && styles.dim]}
    >
      <MaterialCommunityIcons
        name={tool.icon}
        size={28}
        color={unavailable ? colors.textMuted : colors.primary}
      />
      <View style={styles.text}>
        <Text style={[styles.label, { color: colors.text }]}>{name}</Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {t(tool.descriptionKey)}
        </Text>
      </View>
      {unavailable ? (
        <View style={[styles.badge, { borderColor: colors.border }]}>
          <Text style={[styles.badgeText, { color: colors.textMuted }]}>
            {t('tools.comingSoon')}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dim: { opacity: 0.7 },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 13 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
