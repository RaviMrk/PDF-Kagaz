import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/BottomSheet';
import { FileActionRow, useFileActions } from '@/components/useFileActions';
import type { FileRow } from '@/db/schema';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';

type Props = { file: FileRow | null; onClose: () => void };

export function FileActionsSheet({ file, onClose }: Props) {
  if (!file) return null;
  // Keyed by file: state, pending actions and errors never carry over to another file.
  return <Sheet key={file.id} file={file} onClose={onClose} />;
}

function Sheet({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { items, busy, errorKey, panel } = useFileActions(file, { onDone: onClose });

  // Dismissal (backdrop, hardware back) is ignored while an action is pending.
  const dismiss = () => {
    if (busy === null) onClose();
  };

  if (panel) return panel;

  return (
    <BottomSheet onRequestClose={dismiss} onScrimPress={dismiss} scrimLabel={t('files.close')}>
      <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
        {displayName(file.name)}
      </Text>
      {errorKey ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
          {t(errorKey)}
        </Text>
      ) : null}
      {items.map((item) => (
        <FileActionRow key={item.key} item={item} busy={busy} />
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  error: { marginBottom: 8 },
});
