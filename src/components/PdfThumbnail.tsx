import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import type { FileRow } from '@/db/schema';
import { useFiles } from '@/stores/filesStore';
import { useTheme } from '@/theme/useTheme';

type Props = { file: FileRow; width: number; height: number };

function PdfThumbnailImpl({ file, width, height }: Props) {
  const { colors } = useTheme();

  useEffect(() => {
    if (!file.thumbPath) useFiles.getState().requestThumb(file);
    // Re-request only when the row's content (not its identity) changes.
  }, [file]);

  const box = [
    styles.box,
    { width, height, backgroundColor: colors.surface, borderColor: colors.border },
  ];
  if (file.thumbPath) {
    const uri = file.thumbPath.startsWith('/') ? `file://${file.thumbPath}` : file.thumbPath;
    return (
      <View testID="pdf-thumbnail" style={box}>
        <Image
          testID="pdf-thumbnail-image"
          source={{ uri }}
          style={{ width, height }}
          contentFit="cover"
          accessible={false}
          // The cached JPEG was cleared (Clear cache / OS trim): regenerate it.
          onError={() => useFiles.getState().thumbMissing(file.id)}
        />
      </View>
    );
  }
  const icon = file.isEncrypted
    ? 'lock-outline'
    : file.isCorrupt
      ? 'file-alert-outline'
      : 'file-pdf-box';
  return (
    <View testID="pdf-thumbnail" style={box}>
      <MaterialCommunityIcons
        name={icon}
        size={Math.min(width, height) * 0.6}
        color={file.isCorrupt ? colors.danger : colors.textMuted}
      />
    </View>
  );
}

export const PdfThumbnail = memo(PdfThumbnailImpl);

const styles = StyleSheet.create({
  // Hairline border: a white first page must stand out on a white background.
  box: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
