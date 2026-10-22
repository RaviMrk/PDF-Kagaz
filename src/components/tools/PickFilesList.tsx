import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PdfThumbnail } from '@/components/PdfThumbnail';
import type { FileRow } from '@/db/schema';
import { normalizeForSearch } from '@/services/files/fileQuery';
import { JS_MAX_FILE_BYTES } from '@/services/tools/limits';
import { useTheme } from '@/theme/useTheme';
import { displayName } from '@/utils/displayName';
import { formatBytes } from '@/utils/fileSize';

type Props = {
  files: FileRow[];
  selectedIds: readonly string[];
  max: number;
  onToggle(id: string): void;
};

export function PickFilesList({ files, selectedIds, max, onToggle }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visible = useMemo(() => {
    const q = normalizeForSearch(query);
    return q ? files.filter((f) => normalizeForSearch(displayName(f.name)).includes(q)) : files;
  }, [files, query]);
  const full = selectedIds.length >= max;

  return (
    <View style={styles.root}>
      <TextInput
        accessibilityLabel={t('tool.search')}
        placeholder={t('tool.search')}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        style={[styles.search, { color: colors.text, borderColor: colors.border }]}
      />
      {visible.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          {t(files.length === 0 ? 'tool.noFiles' : 'tool.noMatches')}
        </Text>
      ) : (
        <FlashList
          data={visible}
          extraData={selected}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => {
            const checked = selected.has(item.id);
            const tooLarge = item.sizeBytes > JS_MAX_FILE_BYTES;
            const disabled = !checked && (tooLarge || full);
            const name = displayName(item.name);
            const folder = item.folder === '' ? t('tool.fromOtherApp') : item.folder;
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={t('tool.selectFile', { name })}
                accessibilityState={{ checked, disabled }}
                onPress={() => {
                  if (!disabled) onToggle(item.id);
                }}
                style={[styles.row, disabled && styles.dim]}
              >
                <MaterialCommunityIcons
                  name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={24}
                  color={checked ? colors.primary : colors.textMuted}
                />
                <PdfThumbnail file={item} width={36} height={48} />
                <View style={styles.text}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                    {name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.textMuted }}>
                    {item.folder === '' ? folder : `${formatBytes(item.sizeBytes)} · ${folder}`}
                  </Text>
                  {tooLarge ? (
                    <Text style={{ color: colors.danger }}>{t('tool.tooLargeFile')}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  empty: { textAlign: 'center', padding: 24 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  dim: { opacity: 0.5 },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '500' },
});
