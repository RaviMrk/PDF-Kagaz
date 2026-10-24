import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

type Props = {
  visible: boolean;
  fileName: string;
  /** The last password was rejected. */
  wrong: boolean;
  onSubmit(password: string): void;
  onCancel(): void;
  /** Replaces the reader's body text (`password.body`). */
  body?: string;
  /** Replaces the submit label (`password.open`). */
  submitLabel?: string;
  /** Shown instead of `password.wrong` when `wrong`. */
  errorText?: string | null;
};

/** Asks for a PDF's password. The value is handed to `onSubmit` and never stored here afterwards. */
export function PasswordDialog({
  visible,
  fileName,
  wrong,
  onSubmit,
  onCancel,
  body,
  submitLabel,
  errorText,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const empty = value === '';

  const submit = () => {
    if (empty) return;
    const password = value;
    setValue('');
    onSubmit(password);
  };
  const cancel = () => {
    setValue('');
    onCancel();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('password.title')}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {body ?? t('password.body', { name: fileName })}
          </Text>
          <View style={[styles.field, { borderColor: colors.border }]}>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={t('password.placeholder')}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t('password.placeholder')}
              secureTextEntry={!shown}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              onSubmitEditing={submit}
              style={[styles.input, { color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(shown ? 'password.hide' : 'password.show')}
              onPress={() => setShown((s) => !s)}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons
                name={shown ? 'eye-off-outline' : 'eye-outline'}
                size={24}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
          {wrong ? (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
              {errorText ?? t('password.wrong')}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('password.cancel')}
              onPress={cancel}
              style={styles.button}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>
                {t('password.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={submitLabel ?? t('password.open')}
              accessibilityState={{ disabled: empty }}
              disabled={empty}
              onPress={submit}
              style={styles.button}
            >
              <Text
                style={[styles.buttonText, { color: empty ? colors.textMuted : colors.primary }]}
              >
                {submitLabel ?? t('password.open')}
              </Text>
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
  body: { fontSize: 16 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  input: { flex: 1, paddingHorizontal: 12, minHeight: 48, fontSize: 16 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
