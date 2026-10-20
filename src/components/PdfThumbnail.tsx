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

  const box = [styles.box, { width, height, backgroundColor: colors.surface }];
  if (file.thumbPath) {
    const uri = file.thumbPath.startsWith('/') ? `file://${file.thumbPath}` : file.thumbPath;
    return (
      <View style={box}>
        <Image source={{ uri }} style={{ width, height }} contentFit="cover" accessible={false} />
      </View>
    );
  }
  const icon = file.isEncrypted
    ? 'lock-outline'
    : file.isCorrupt
      ? 'file-alert-outline'
      : 'file-pdf-box';
  return (
    <View style={box}>
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
  box: { borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
