import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useFiles } from '@/stores/filesStore';
import { useStorage } from '@/stores/storageStore';
import { useTheme } from '@/theme/useTheme';

export function ScannedFoldersSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const roots = useStorage((s) => s.roots);
  const [failed, setFailed] = useState(false);

  const add = async () => {
    setFailed(false);
    try {
      const added = await useStorage.getState().addFolder();
      if (added) void useFiles.getState().refresh('full');
    } catch {
      setFailed(true);
    }
  };

  const remove = async (uri: string) => {
    setFailed(false);
    try {
      await useStorage.getState().removeFolder(uri);
      // Removal already dropped the rows from the index; just re-read the cached list.
      useFiles.getState().loadFromCache();
    } catch {
      setFailed(true);
    }
  };

  return (
    <View>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        {t('settings.scannedFolders')}
      </Text>
      {roots.length === 0 ? (
        <Text style={[styles.note, { color: colors.textMuted }]}>{t('settings.noFolders')}</Text>
      ) : (
        roots.map((root) => (
          <View key={root.uri} style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: colors.text }]}>{root.label}</Text>
              {!root.granted ? (
                <Text style={[styles.note, { color: colors.danger }]}>
                  {t('settings.accessLost')}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.removeFolder', { label: root.label })}
              onPress={() => void remove(root.uri)}
              style={styles.iconButton}
            >
              <Text style={[styles.label, { color: colors.primary }]}>✕</Text>
            </Pressable>
          </View>
        ))
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.addFolder')}
        onPress={() => void add()}
        style={styles.addButton}
      >
        <Text style={[styles.label, { color: colors.primary }]}>{t('settings.addFolder')}</Text>
      </Pressable>
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.note, { color: colors.danger }]}>
          {t('storage.error')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 16, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  label: { fontSize: 16 },
  note: { fontSize: 14 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  addButton: { minHeight: 48, justifyContent: 'center' },
});
