import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FileInfoSheet } from '@/components/FileInfoSheet';
import { RenameDialog } from '@/components/RenameDialog';
import type { FileRow } from '@/db/schema';
import { useFiles, type FileActionError } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';
import { isInAppFolder } from '@/utils/appFolder';
import { displayName } from '@/utils/displayName';
import { fileActionErrorKey } from '@/utils/fileActionError';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

export type FileActionKey = 'favorite' | 'rename' | 'duplicate' | 'move' | 'info' | 'delete';

export type FileActionItem = {
  key: FileActionKey;
  icon: Icon;
  label: string;
  onPress: () => void;
};

type Options = {
  /** An action finished (favourite toggled, renamed, duplicated, moved, deleted). */
  onDone: (key: FileActionKey) => void;
};

/** Output rows (moved or created by the app) and files already in the app folder. */
function inAppFolder(file: FileRow): boolean {
  return file.source === 'output' || isInAppFolder(file);
}

/** Returns a getter (not the ref) so callers can check liveness from async continuations. */
function useIsMounted(): () => boolean {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return () => ref.current;
}

/**
 * The single-file actions (favourite, rename, duplicate, move to the app folder, info, delete)
 * shared by the Files tab's sheet and the reader's menu. Rename and info open their own panel,
 * which the caller shows in place of its list while `panel` is set.
 */
export function useFileActions(file: FileRow, { onDone }: Options) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<'rename' | 'info' | null>(null);
  // File actions wait for an in-flight scan (writer lock): show which one is pending.
  const [busy, setBusy] = useState<FileActionKey | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const isMounted = useIsMounted();

  const run = async (key: FileActionKey, op: () => Promise<FileActionError | null>) => {
    if (busy) return;
    setBusy(key);
    setErrorKey(null);
    const error = await op();
    if (!isMounted()) return; // The caller moved on to another file (or closed).
    setBusy(null);
    if (error) setErrorKey(fileActionErrorKey(error));
    else onDone(key);
  };

  const confirmDelete = () =>
    Alert.alert(t('files.deleteTitle'), t('files.deleteBody', { name: displayName(file.name) }), [
      { text: t('files.cancel'), style: 'cancel' },
      {
        text: t('files.delete'),
        style: 'destructive',
        onPress: () => void run('delete', () => useFiles.getState().remove(file.id)),
      },
    ]);

  const items: FileActionItem[] = [
    {
      key: 'favorite',
      icon: file.isFavorite ? 'star-off-outline' : 'star-outline',
      label: file.isFavorite ? t('files.unfavorite') : t('files.favorite'),
      onPress: () => {
        useFiles.getState().toggleFavorite(file.id);
        onDone('favorite');
      },
    },
    {
      key: 'rename',
      icon: 'pencil-outline',
      label: t('files.rename'),
      onPress: () => setPanel('rename'),
    },
    {
      key: 'duplicate',
      icon: 'content-copy',
      label: t('files.duplicate'),
      onPress: () => void run('duplicate', () => useFiles.getState().duplicate(file.id)),
    },
    ...(inAppFolder(file)
      ? []
      : [
          {
            key: 'move',
            icon: 'folder-move-outline',
            label: t('files.moveToApp'),
            onPress: () => void run('move', () => useFiles.getState().moveToAppFolder(file.id)),
          } satisfies FileActionItem,
        ]),
    {
      key: 'info',
      icon: 'information-outline',
      label: t('files.info'),
      onPress: () => setPanel('info'),
    },
    { key: 'delete', icon: 'delete-outline', label: t('files.delete'), onPress: confirmDelete },
  ];

  let panelElement: ReactNode = null;
  if (panel === 'rename') {
    panelElement = (
      <RenameDialog
        file={file}
        onCancel={() => setPanel(null)}
        onDone={() => {
          setPanel(null);
          onDone('rename');
        }}
      />
    );
  } else if (panel === 'info') {
    panelElement = <FileInfoSheet file={file} onClose={() => setPanel(null)} />;
  }

  /** Forgets an open panel and the last error (the caller closed). */
  const reset = () => {
    setPanel(null);
    setErrorKey(null);
  };

  return { items, busy, errorKey, panel: panelElement, reset };
}

type RowProps = { item: FileActionItem; busy: FileActionKey | null; disabled?: boolean };

/** One file action: icon and label, a spinner while it runs, dimmed while another runs. */
export function FileActionRow({ item, busy, disabled = false }: RowProps) {
  const { colors } = useTheme();
  const blocked = disabled || busy !== null;
  const color = item.key === 'delete' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ disabled: blocked, busy: busy === item.key }}
      disabled={blocked}
      onPress={item.onPress}
      style={[styles.item, blocked && busy !== item.key && styles.dim]}
    >
      {busy === item.key ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialCommunityIcons name={item.icon} size={24} color={color} />
      )}
      <Text style={[styles.itemText, { color }]}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48 },
  itemText: { flex: 1, fontSize: 16 },
  dim: { opacity: 0.5 },
});
