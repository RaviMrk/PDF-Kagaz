import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ToolPhase } from '@/services/tools/runTool';
import { useTheme } from '@/theme/useTheme';

type Props = {
  visible: boolean;
  title: string;
  phase: ToolPhase;
  fraction: number;
  onCancel(): void;
  onHide(): void;
};

export function ProgressSheet({ visible, title, phase, fraction, onCancel, onHide }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const percent = Math.round(clamped * 100);
  return (
    <Modal
      testID="progress-modal"
      visible={visible}
      transparent
      animationType="fade"
      // Android back keeps the job running and just hides the sheet.
      onRequestClose={onHide}
    >
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={title}
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={[styles.track, { backgroundColor: colors.surface }]}
          >
            <View
              style={[styles.fill, { backgroundColor: colors.primary, width: `${percent}%` }]}
            />
          </View>
          <View style={styles.row}>
            <Text style={{ color: colors.textMuted }}>{t(`progress.${phase}`)}</Text>
            <Text style={{ color: colors.text }}>{t('progress.percent', { percent })}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('progress.cancel')}
              onPress={onCancel}
              style={styles.button}
            >
              <Text style={[styles.buttonText, { color: colors.danger }]}>
                {t('progress.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('progress.hide')}
              onPress={onHide}
              style={styles.button}
            >
              <Text style={[styles.buttonText, { color: colors.primary }]}>
                {t('progress.hide')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
