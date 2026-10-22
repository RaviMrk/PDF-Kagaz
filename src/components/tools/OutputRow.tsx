import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PdfThumbnail } from '@/components/PdfThumbnail';
import type { FileRow } from '@/db/schema';
import { runReaderAction, type ReaderActionResult } from '@/services/reader/readerActions';
import { saveOutputCopy, type SaveCopyResult } from '@/services/tools/outputActions';
import { useFiles } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';
import { formatBytes } from '@/utils/fileSize';

type Props = { file: FileRow; onNotice(key: string): void };

const SHARE_FAILURE_KEYS: Record<Exclude<ReaderActionResult, 'ok'>, string> = {
  notFound: 'files.errorNotFound',
  unavailable: 'reader.errorUnavailable',
  permission: 'reader.errorPermission',
  unknown: 'files.errorUnknown',
};
const SAVE_FAILURE_KEYS: Record<Exclude<SaveCopyResult, 'saved' | 'cancelled'>, string> = {
  notFound: 'files.errorNotFound',
  permission: 'reader.errorPermission',
  unknown: 'files.errorUnknown',
};

/** One output file with Open, Share and Save as… (also used for unindexed fallback rows). */
export function OutputRow({ file, onNotice }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const name = displayName(file.name);
  const meta = [formatBytes(file.sizeBytes)];
  if (file.pageCount != null) meta.push(t('files.pages', { count: file.pageCount }));

  const share = async () => {
    const result = await runReaderAction('share', { uri: file.uri, title: t('result.shareTitle') });
    if (result === 'ok') return;
    if (result === 'notFound') useFiles.getState().dropMissing(file.id);
    onNotice(SHARE_FAILURE_KEYS[result]);
  };

  const saveAs = async () => {
    const result = await saveOutputCopy(file);
    if (result === 'cancelled') return;
    if (result === 'saved') {
      onNotice('result.saved');
      return;
    }
    if (result === 'notFound') useFiles.getState().dropMissing(file.id);
    onNotice(SAVE_FAILURE_KEYS[result]);
  };

  const actions = [
    {
      key: 'open',
      label: t('result.open'),
      a11y: t('result.openA11y', { name }),
      onPress: () => router.push({ pathname: '/reader/[id]', params: { id: file.id } }),
    },
    {
      key: 'share',
      label: t('result.share'),
      a11y: t('result.shareA11y', { name }),
      onPress: share,
    },
    {
      key: 'saveAs',
      label: t('result.saveAs'),
      a11y: t('result.saveAsA11y', { name }),
      onPress: saveAs,
    },
  ];

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={styles.info}>
        <PdfThumbnail file={file} width={48} height={64} />
        <View style={styles.text}>
          <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>
            {name}
          </Text>
          <Text style={{ color: colors.textMuted }}>{meta.join(' · ')}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.a11y}
            onPress={a.onPress}
            style={styles.button}
          >
            <Text style={[styles.buttonText, { color: colors.primary }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 8 },
  info: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
