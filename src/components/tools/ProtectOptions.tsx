import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RunButton } from '@/components/tools/RunButton';
import type { FileRow } from '@/db/schema';
import { validateNewPassword } from '@/services/tools/newPassword';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';

type Props = { row: FileRow; onRun(newPassword: string): void };

type FieldProps = {
  label: string;
  value: string;
  onChange(value: string): void;
  invalid: boolean;
};

function PasswordField({ label, value, onChange, invalid }: FieldProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  return (
    <View style={[styles.field, { borderColor: invalid ? colors.danger : colors.border }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        style={[styles.input, { color: colors.text }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(shown ? 'protect.hide' : 'protect.show')}
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
  );
}

/**
 * Protect options: the new password typed twice. The values live only in this component's state
 * (gone when it unmounts) and are handed to `onRun`; the validation message shows once Run was
 * pressed.
 */
export function ProtectOptions({ row, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [attempted, setAttempted] = useState(false);
  const error = validateNewPassword(password, confirm);
  const shownError = attempted ? error : null;

  const run = () => {
    setAttempted(true);
    if (error === null) onRun(password);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: colors.textMuted }}>{displayName(row.name)}</Text>
        <PasswordField
          label={t('protect.password')}
          value={password}
          onChange={setPassword}
          invalid={shownError === 'tooShort' || shownError === 'tooLong'}
        />
        <PasswordField
          label={t('protect.confirm')}
          value={confirm}
          onChange={setConfirm}
          invalid={shownError === 'mismatch'}
        />
        {shownError ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
            {t(`protect.${shownError}`)}
          </Text>
        ) : null}
        <Text style={{ color: colors.textMuted }}>{t('protect.warning')}</Text>
      </ScrollView>
      <RunButton
        label={t('protect.run')}
        disabled={password === '' || confirm === ''}
        onPress={run}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  scroll: { flex: 1 },
  content: { gap: 12 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  input: { flex: 1, paddingHorizontal: 12, minHeight: 48, fontSize: 16 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
