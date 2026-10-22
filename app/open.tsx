import { router, useLocalSearchParams, useNavigation, useRoute } from 'expo-router';
import { CommonActions } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { takeIncomingUri } from '@/services/intent/incomingLink';
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
  // Only a one-time nonce travels in the route; the raw uri never does (see incomingLink).
  const params = useLocalSearchParams<{ t?: string | string[] }>();
  const nonce = typeof params.t === 'string' ? params.t : '';
  // The failure belongs to the nonce it was reported for; a new nonce starts over.
  const [result, setResult] = useState<{ nonce: string; failure: Failure } | null>(null);
  // One attempt per nonce, even when the effect runs again (Strict Mode remount); null = refused.
  const pending = useRef<{ nonce: string; result: Promise<IncomingResult> | null } | null>(null);
  const failure: Failure | null = result?.nonce === nonce ? result.failure : null;

  useEffect(() => {
    if (pending.current?.nonce !== nonce) {
      // Missing, unknown or used nonce: not a system intent, nothing to open.
      const uri = nonce === '' ? null : takeIncomingUri(nonce);
      pending.current = { nonce, result: uri === null ? null : openIncomingPdf(uri) };
      if (uri === null) router.replace('/home');
    }
    const attempt = pending.current.result;
    if (!attempt) return;
    let active = true;
    void attempt.then((r) => {
      if (!active) return;
      if (!r.ok) {
        setResult({ nonce, failure: r.reason });
        return;
      }
      // Already replaced by another incoming open: leave the stack alone.
      const current = navigation.getState()?.routes ?? [];
      if (incomingReaderRoutes(current, route.key, r.id) === null) return;
      navigation.dispatch((state) => {
        const routes = incomingReaderRoutes(state.routes, route.key, r.id);
        if (routes === null) return CommonActions.reset(state);
        return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
      });
    });
    return () => {
      active = false;
    };
  }, [nonce, navigation, route.key]);

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
