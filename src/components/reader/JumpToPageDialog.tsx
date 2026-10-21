import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { parsePageInput } from '@/services/reader/pageInput';
import { useTheme } from '@/theme/useTheme';

type Props = {
  visible: boolean;
  pageCount: number;
  onGo(page: number): void;
  onCancel(): void;
};

export function JumpToPageDialog({ visible, pageCount, onGo, onCancel }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const reset = () => {
    setValue('');
    setInvalid(false);
  };
  const go = () => {
    const page = parsePageInput(value, pageCount);
    if (page === null) {
      setInvalid(true);
      return;
    }
    reset();
    onGo(page);
  };
  const cancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('reader.jumpTitle')}
          </Text>
          <TextInput
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setInvalid(false);
            }}
            placeholder={t('reader.jumpPlaceholder')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('reader.jumpPlaceholder')}
            keyboardType="number-pad"
            autoFocus
            onSubmitEditing={go}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          {invalid ? (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
              {t('reader.jumpError', { count: pageCount })}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('reader.cancel')}
              onPress={cancel}
              style={styles.button}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>{t('reader.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('reader.jumpGo')}
              onPress={go}
              style={styles.button}
            >
              <Text style={[styles.buttonText, { color: colors.primary }]}>
                {t('reader.jumpGo')}
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
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, minHeight: 48, fontSize: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
