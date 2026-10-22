import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { toolById } from '@/services/tools/toolRegistry';
import { useToolJobs } from '@/stores/toolJobStore';
import { useTheme } from '@/theme/useTheme';

/** Home card for a tool running in the background, or a finished job not yet viewed. */
export function ActiveJobCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const active = useToolJobs((s) => s.active);
  const last = useToolJobs((s) => s.last);

  let jobId: string;
  let text: string;
  if (active) {
    jobId = active.jobId;
    const percent = Math.round(
      Math.min(1, Math.max(0, Number.isFinite(active.fraction) ? active.fraction : 0)) * 100,
    );
    text = t('home.jobRunning', { tool: toolLabel(active.toolId, t), percent });
  } else if (last && !last.seen) {
    jobId = last.jobId;
    text = t(last.outcome.ok ? 'home.jobDone' : 'home.jobFailed', {
      tool: toolLabel(last.toolId, t),
    });
  } else {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.viewResult')}
        onPress={() => router.push(`/result?jobId=${jobId}`)}
        style={styles.button}
      >
        <Text style={[styles.buttonText, { color: colors.primary }]}>{t('home.viewResult')}</Text>
      </Pressable>
    </View>
  );
}

function toolLabel(toolId: string, t: (key: string) => string): string {
  const tool = toolById(toolId);
  return tool ? t(tool.labelKey) : toolId;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 4,
    gap: 8,
  },
  text: { flex: 1, fontSize: 15, fontWeight: '500' },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
