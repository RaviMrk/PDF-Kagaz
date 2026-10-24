import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  shareSavedImages,
  viewSavedImage,
  type ImageActionResult,
} from '@/services/tools/imageActions';
import type { SavedImages } from '@/services/tools/runTool';
import { useTheme } from '@/theme/useTheme';

type Props = { images: SavedImages; onNotice(key: string): void };

const FAILURE_KEYS: Record<Exclude<ImageActionResult, 'ok'>, string> = {
  notFound: 'files.errorNotFound',
  permission: 'reader.errorPermission',
  unknown: 'files.errorUnknown',
};

/**
 * Where PDF to images saved its pages, with Open (the first image) and Share (all of them). A
 * recovered job row keeps no uris: it says where, with both buttons disabled.
 */
export function SavedImagesCard({ images, onNotice }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { uris } = images;
  const none = uris.length === 0;

  const report = (result: ImageActionResult) => {
    if (result !== 'ok') onNotice(FAILURE_KEYS[result]);
  };
  const open = async () => {
    if (none) return;
    report(await viewSavedImage(uris[0]!, t('toImages.open')));
  };
  const share = async () => {
    if (none) return;
    report(await shareSavedImages(uris, t('toImages.shareTitle')));
  };

  const button = (label: string, onPress: () => Promise<void>) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: none }}
      disabled={none}
      onPress={() => void onPress()}
      style={[styles.button, none && styles.dim]}
    >
      <Text style={[styles.buttonText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={{ color: colors.text }}>
        {none
          ? t('toImages.savedRecovered')
          : t('toImages.saved', { count: images.count, folder: images.folder })}
      </Text>
      {images.reducedPages > 0 ? (
        <Text style={{ color: colors.textMuted }}>
          {t('toImages.reduced', { count: images.reducedPages })}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {button(t('toImages.open'), open)}
        {button(t('toImages.share'), share)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, borderRadius: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  dim: { opacity: 0.5 },
});
