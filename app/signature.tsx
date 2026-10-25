import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature/SignaturePad';
import type { SignatureRow } from '@/db/schema';
import { useSignatures } from '@/stores/signaturesStore';
import { useTheme } from '@/theme/useTheme';
import { formatDate } from '@/utils/date';

type Ink = 'black' | 'blue';

/** The pad is always white (ink colours are dark); previews sit on grey so transparency shows. */
const PAD_BACKGROUND = '#FFFFFF';
const PREVIEW_BACKGROUND = '#DADCE0';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/** Draw a signature and keep up to 10 of them for Sign PDF. */
export default function SignatureScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const items = useSignatures((s) => s.items);
  const pad = useRef<SignaturePadHandle>(null);
  const saving = useRef(false);
  const [ink, setInk] = useState<Ink>('black');
  const [empty, setEmpty] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    useSignatures.getState().load();
  }, []);

  const clear = async () => {
    setNotice(null);
    try {
      await pad.current?.clear();
    } catch {
      // The pad stays as it is; nothing to report.
    }
  };

  const save = async () => {
    if (saving.current || empty) return;
    saving.current = true;
    setNotice(null);
    try {
      const sig = await pad.current?.exportPng();
      if (!sig) return;
      const result = useSignatures.getState().save(sig);
      if (result.ok) leave();
      else setNotice(t(result.reason === 'full' ? 'signature.full' : 'signature.saveFailed'));
    } catch {
      setNotice(t('signature.saveFailed'));
    } finally {
      saving.current = false;
    }
  };

  const confirmDelete = (row: SignatureRow) => {
    Alert.alert(t('signature.deleteTitle'), t('signature.deleteBody'), [
      { text: t('files.cancel'), style: 'cancel' },
      {
        text: t('files.delete'),
        style: 'destructive',
        onPress: () => void useSignatures.getState().remove(row.id),
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tool.back')}
          onPress={leave}
          style={styles.textButton}
        >
          <Text style={[styles.textButtonLabel, { color: colors.primary }]}>{t('tool.back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('signature.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textMuted }}>{t('signature.hint')}</Text>
        <SignaturePad
          ref={pad}
          inkColor={ink}
          onChange={setEmpty}
          accessibilityLabel={t('signature.padLabel')}
          style={[styles.pad, { borderColor: colors.border }]}
        />
        <ChoiceChips
          label={t('signature.ink')}
          options={[
            { key: 'black', label: t('signature.black') },
            { key: 'blue', label: t('signature.blue') },
          ]}
          value={ink}
          onChange={setInk}
        />
        <Text accessibilityRole="header" style={[styles.section, { color: colors.text }]}>
          {t('signature.saved')}
        </Text>
        {items.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>{t('signature.none')}</Text>
        ) : (
          items.map((row) => (
            <SavedSignature key={row.id} row={row} onDelete={() => confirmDelete(row)} />
          ))
        )}
      </ScrollView>
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: colors.danger }]}>
          {notice}
        </Text>
      ) : null}
      <View style={[styles.bar, { backgroundColor: colors.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('signature.clear')}
          onPress={() => void clear()}
          style={[styles.barButton, styles.outline, { borderColor: colors.primary }]}
        >
          <Text style={[styles.barLabel, { color: colors.primary }]}>{t('signature.clear')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('signature.save')}
          accessibilityState={{ disabled: empty }}
          disabled={empty}
          onPress={() => void save()}
          style={[styles.barButton, { backgroundColor: colors.primary }, empty && styles.dim]}
        >
          <Text style={[styles.barLabel, { color: colors.onPrimary }]}>{t('signature.save')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SavedSignature({ row, onDelete }: { row: SignatureRow; onDelete(): void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const label = t('signature.item', { date: formatDate(row.createdAt, i18n.language) });
  return (
    <View style={[styles.item, { borderColor: colors.border }]}>
      <Image
        source={{ uri: row.pngPath }}
        contentFit="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={styles.preview}
      />
      <Text style={[styles.itemLabel, { color: colors.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('signature.delete')}
        onPress={onDelete}
        style={styles.iconButton}
      >
        <MaterialCommunityIcons name="delete-outline" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '600' },
  textButton: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, justifyContent: 'center' },
  textButtonLabel: { fontSize: 16, fontWeight: '600' },
  content: { gap: 12, paddingBottom: 16 },
  pad: {
    width: '100%',
    minHeight: 200,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: PAD_BACKGROUND,
  },
  section: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  preview: { width: 120, height: 60, borderRadius: 4, backgroundColor: PREVIEW_BACKGROUND },
  itemLabel: { flex: 1 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  notice: { textAlign: 'center' },
  bar: { flexDirection: 'row', gap: 12, padding: 8, borderRadius: 12 },
  barButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: { borderWidth: 1 },
  barLabel: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  dim: { opacity: 0.5 },
});
