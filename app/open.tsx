import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { openIncomingPdf, type IncomingResult } from '@/services/intent/openIncomingPdf';
import { useTheme } from '@/theme/useTheme';

type Failure = Extract<IncomingResult, { ok: false }>['reason'];

const FAILURE_KEYS = {
  permission: 'open.errorPermission',
  notFound: 'open.errorNotFound',
  unknown: 'open.errorUnknown',
} as const satisfies Record<Failure, string>;

/** A PDF handed to the app ("Open with" or share): registers it, then shows it in the reader. */
export default function OpenScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  // The failure belongs to the uri it was reported for; a new uri starts over.
  const [result, setResult] = useState<{ uri: string; failure: Failure } | null>(null);
  // One openIncomingPdf per uri, even when the effect runs again (Strict Mode remount).
  const pending = useRef<{ uri: string; result: Promise<IncomingResult> } | null>(null);
  const failure: Failure | null = !uri ? 'unknown' : result?.uri === uri ? result.failure : null;

  useEffect(() => {
    if (!uri) return;
    if (pending.current?.uri !== uri) pending.current = { uri, result: openIncomingPdf(uri) };
    let active = true;
    void pending.current.result.then((r) => {
      if (!active) return;
      if (r.ok) router.replace({ pathname: '/reader/[id]', params: { id: r.id } });
      else setResult({ uri, failure: r.reason });
    });
    return () => {
      active = false;
    };
  }, [uri]);

  if (failure) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="file-alert-outline"
          title={t('open.failedTitle')}
          message={t(FAILURE_KEYS[failure])}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('open.goHome')}
          onPress={() => router.replace('/home')}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('open.goHome')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.text }}>{t('open.opening')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  button: {
    alignSelf: 'center',
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
