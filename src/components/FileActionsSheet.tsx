import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FileInfoSheet } from '@/components/FileInfoSheet';
import { RenameDialog } from '@/components/RenameDialog';
import type { FileRow } from '@/db/schema';
import { useFiles, type FileActionError } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';
import { fileActionErrorKey } from '@/utils/fileActionError';

type Props = { file: FileRow | null; onClose: () => void };
type Panel = 'actions' | 'rename' | 'info';
type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

function inAppFolder(file: FileRow): boolean {
  try {
    return decodeURIComponent(file.uri).includes('/Documents/PDFToolkit/');
  } catch {
    return false;
  }
}

export function FileActionsSheet({ file, onClose }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [panel, setPanel] = useState<Panel>('actions');
  // File actions wait for an in-flight scan (writer lock): show which one is pending.
  const [busy, setBusy] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (!file) return null;

  const close = () => {
    setPanel('actions');
    setErrorKey(null);
    onClose();
  };

  const run = async (key: string, op: () => Promise<FileActionError | null>) => {
    if (busy) return;
    setBusy(key);
    setErrorKey(null);
    const error = await op();
    setBusy(null);
    if (error) setErrorKey(fileActionErrorKey(error));
    else close();
  };

  const confirmDelete = () =>
    Alert.alert(t('files.deleteTitle'), t('files.deleteBody', { name: file.name }), [
      { text: t('files.cancel'), style: 'cancel' },
      {
        text: t('files.delete'),
        style: 'destructive',
        onPress: () => void run('delete', () => useFiles.getState().remove(file.id)),
      },
    ]);

  const item = (key: string, icon: Icon, label: string, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy !== null, busy: busy === key }}
      disabled={busy !== null}
      onPress={onPress}
      style={[styles.item, busy !== null && busy !== key && styles.dim]}
    >
      {busy === key ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={24}
          color={key === 'delete' ? colors.danger : colors.text}
        />
      )}
      <Text style={[styles.itemText, { color: key === 'delete' ? colors.danger : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );

  if (panel === 'rename') {
    return <RenameDialog file={file} onCancel={() => setPanel('actions')} onDone={close} />;
  }
  if (panel === 'info') return <FileInfoSheet file={file} onClose={() => setPanel('actions')} />;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <Pressable accessibilityLabel={t('files.close')} onPress={close} style={styles.backdrop} />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {file.name}
        </Text>
        {errorKey ? (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {t(errorKey)}
          </Text>
        ) : null}
        {item(
          'favorite',
          file.isFavorite ? 'star-off-outline' : 'star-outline',
          file.isFavorite ? t('files.unfavorite') : t('files.favorite'),
          () => {
            useFiles.getState().toggleFavorite(file.id);
            close();
          },
        )}
        {item('rename', 'pencil-outline', t('files.rename'), () => setPanel('rename'))}
        {item(
          'duplicate',
          'content-copy',
          t('files.duplicate'),
          () => void run('duplicate', () => useFiles.getState().duplicate(file.id)),
        )}
        {inAppFolder(file)
          ? null
          : item(
              'move',
              'folder-move-outline',
              t('files.moveToApp'),
              () => void run('move', () => useFiles.getState().moveToAppFolder(file.id)),
            )}
        {item('info', 'information-outline', t('files.info'), () => setPanel('info'))}
        {item('delete', 'delete-outline', t('files.delete'), confirmDelete)}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  error: { marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48 },
  itemText: { fontSize: 16 },
  dim: { opacity: 0.5 },
});
