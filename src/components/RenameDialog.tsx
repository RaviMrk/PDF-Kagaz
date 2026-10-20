import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import type { FileRow } from '@/db/schema';
import { useFiles } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';
import { fileActionErrorKey } from '@/utils/fileActionError';
import { validatePdfFileName } from '@/utils/fileName';

const REASON_KEYS = {
  empty: 'files.errorEmpty',
  invalidChars: 'files.errorInvalidChars',
  tooLong: 'files.errorTooLong',
} as const;

type Props = {
  file: FileRow;
  onCancel: () => void;
  /** The file was renamed. */
  onDone: () => void;
};

export function RenameDialog({ file, onCancel, onDone }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [value, setValue] = useState(file.name);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    const result = validatePdfFileName(value);
    if (!result.ok) {
      setErrorKey(REASON_KEYS[result.reason]);
      return;
    }
    setErrorKey(null);
    setBusy(true);
    const error = await useFiles.getState().rename(file.id, result.name);
    setBusy(false);
    if (error) setErrorKey(fileActionErrorKey(error));
    else onDone();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('files.renameTitle')}
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            accessibilityLabel={t('files.renameTitle')}
            autoFocus
            selectTextOnFocus
            autoCorrect={false}
            onSubmitEditing={() => void save()}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          {errorKey ? (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
              {t(errorKey)}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('files.cancel')}
              onPress={onCancel}
              style={styles.button}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>{t('files.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('files.save')}
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => void save()}
              style={styles.button}
            >
              {busy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.primary }]}>
                  {t('files.save')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { borderRadius: 16, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, minHeight: 48, fontSize: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
