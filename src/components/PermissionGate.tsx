import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { StorageAccessCard } from '@/components/StorageAccessCard';
import { useStorage } from '@/stores/storageStore';
import { useTheme } from '@/theme/useTheme';

export function PermissionGate({ children }: { children: ReactNode }) {
  const mode = useStorage((s) => s.mode);
  const { colors } = useTheme();

  if (mode === 'unknown') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (mode === 'none') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <StorageAccessCard />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
