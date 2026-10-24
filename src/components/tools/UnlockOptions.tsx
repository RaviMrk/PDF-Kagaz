import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RunButton } from '@/components/tools/RunButton';
import type { FileRow } from '@/db/schema';
import { pdfNative } from '@/services/native/pdfNative';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';

type Props = { row: FileRow; onRun(): void };

/**
 * Remove password options: the file is inspected on mount; one with no encryption has nothing to
 * remove (Run disabled). Any other lock, or a file that cannot be inspected now (the job reports
 * what is wrong), can run; the screen asks for the password on Run.
 */
export function UnlockOptions({ row, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // The uri inspected as having no encryption (derived, so a different file starts enabled).
  const [plainUri, setPlainUri] = useState<string | null>(null);
  const notProtected = plainUri === row.uri;

  useEffect(() => {
    let live = true;
    pdfNative.inspectPdf(row.uri).then(
      (lock) => {
        if (live && lock === 'none') setPlainUri(row.uri);
      },
      () => {
        // Unknown lock: Run still asks (an inspect failure counts as locked) and the check or the
        // job reports what is wrong.
      },
    );
    return () => {
      live = false;
    };
  }, [row.uri]);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Text style={{ color: colors.textMuted }}>{displayName(row.name)}</Text>
        {notProtected ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
            {t('unlock.notProtected')}
          </Text>
        ) : (
          <Text style={{ color: colors.textMuted }}>{t('unlock.hint')}</Text>
        )}
      </View>
      <RunButton label={t('unlock.run')} disabled={notProtected} onPress={onRun} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  content: { flex: 1, gap: 12 },
});
