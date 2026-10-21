import { router, useLocalSearchParams, useNavigation, useRoute } from 'expo-router';
import { CommonActions } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { takeIncomingPermit } from '@/services/intent/incomingLink';
import { incomingReaderRoutes } from '@/services/intent/incomingReaderRoutes';
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
  const navigation = useNavigation();
  const route = useRoute();
  const params = useLocalSearchParams<{ uri?: string | string[] }>();
  // A repeated (?uri=a&uri=b) or missing uri is not something a system intent produces.
  const uri = typeof params.uri === 'string' && params.uri !== '' ? params.uri : undefined;
  // The failure belongs to the uri it was reported for; a new uri starts over.
  const [result, setResult] = useState<{ uri: string; failure: Failure } | null>(null);
  // One attempt per uri, even when the effect runs again (Strict Mode remount); null = refused.
  const pending = useRef<{ uri: string; result: Promise<IncomingResult> | null } | null>(null);
  const failure: Failure | null = !uri ? 'unknown' : result?.uri === uri ? result.failure : null;

  useEffect(() => {
    if (!uri) return;
    if (pending.current?.uri !== uri) {
      // Only a system intent grants a permit; a deep link to /open is ignored.
      const permitted = takeIncomingPermit(uri);
      pending.current = { uri, result: permitted ? openIncomingPdf(uri) : null };
      if (!permitted) router.replace('/home');
    }
    const attempt = pending.current.result;
    if (!attempt) return;
    let active = true;
    void attempt.then((r) => {
      if (!active) return;
      if (!r.ok) {
        setResult({ uri, failure: r.reason });
        return;
      }
      navigation.dispatch((state) => {
        const routes = incomingReaderRoutes(state.routes, route.key, r.id);
        return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
      });
    });
    return () => {
      active = false;
    };
  }, [uri, navigation, route.key]);

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
