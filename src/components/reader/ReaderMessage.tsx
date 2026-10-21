import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/useTheme';

type Props = {
  title: string;
  message?: string;
  onClose(): void;
  onRetry?: () => void;
};

/** A full-screen reader state (error or missing row) with Close and an optional Retry. */
export function ReaderMessage({ title, message, onClose, onRetry }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <EmptyState icon="file-alert-outline" title={title} message={message} />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reader.close')}
          onPress={onClose}
          style={[styles.button, { borderColor: colors.border }]}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>{t('reader.close')}</Text>
        </Pressable>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('errors.retry')}
            onPress={onRetry}
            style={[
              styles.button,
              { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              {t('errors.retry')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 24 },
  button: {
    minWidth: 96,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
