import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useFiles } from '@/stores/filesStore';
import { useStorage } from '@/stores/storageStore';
import { useTheme } from '@/theme/useTheme';

type Props = {
  /** Called with the outcome after any attempt that did not throw (denial included, F-01). */
  onDone?: (granted: boolean) => void;
};

export function StorageAccessCard({ onDone }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const canRequestFullAccess = useStorage((s) => s.canRequestFullAccess);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const granted = await action();
      if (granted) void useFiles.getState().refresh('full');
      onDone?.(granted);
    } catch {
      // Friendly message only: errors may carry uris/paths. The app stays usable.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: colors.text }]}>{t('storage.explainer')}</Text>
      {canRequestFullAccess ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('storage.grantAll')}
          disabled={busy}
          onPress={() => void run(() => useStorage.getState().requestFullAccess())}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
            {t('storage.grantAll')}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('storage.pickFolders')}
        disabled={busy}
        onPress={() => void run(() => useStorage.getState().addFolder())}
        style={[styles.button, { borderColor: colors.primary, borderWidth: 1 }]}
      >
        <Text style={[styles.buttonText, { color: colors.primary }]}>
          {t('storage.pickFolders')}
        </Text>
      </Pressable>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('storage.pickHint')}</Text>
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.hint, { color: colors.danger }]}>
          {t('storage.error')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, alignSelf: 'stretch' },
  text: { fontSize: 16, textAlign: 'center' },
  hint: { fontSize: 14, textAlign: 'center' },
  button: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
