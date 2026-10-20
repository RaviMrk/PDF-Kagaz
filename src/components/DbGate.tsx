import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { useTheme } from '@/theme/useTheme';

type MigrationState = { success: boolean; error?: Error };

const useDefaultMigrations = (): MigrationState => useMigrations(db, migrations);

type Props = {
  children: ReactNode;
  /** Test-only injection point. */
  useMigrationsHook?: () => MigrationState;
};

function Gate({
  children,
  useMigrationsHook,
  onRetry,
}: Props & { useMigrationsHook: () => MigrationState; onRetry: () => void }) {
  const { success, error } = useMigrationsHook();
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (success) return <>{children}</>;

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.danger }]}>{t('errors.dbInit')}</Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>{error.message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('errors.retry')}
          onPress={onRetry}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('errors.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function DbGate({ children, useMigrationsHook = useDefaultMigrations }: Props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Gate
      key={attempt}
      useMigrationsHook={useMigrationsHook}
      onRetry={() => setAttempt((n) => n + 1)}
    >
      {children}
    </Gate>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center' },
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
