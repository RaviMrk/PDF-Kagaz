import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ImageFilter } from '@/services/native/pdfNative';
import { imageThumbnail, type ImageItem } from '@/services/tools/imageSession';
import { useTheme } from '@/theme/useTheme';

const TILE_DP = 110;
const MAX_THUMB_PX = 320;

type Props = {
  sessionId: string;
  item: ImageItem;
  filter: ImageFilter;
  /** 1-based position in the list. */
  position: number;
  total: number;
  selected: boolean;
  kind: 'image' | 'page';
  onPress(key: string): void;
};

export const ImageTile = memo(function ImageTile({
  sessionId,
  item,
  filter,
  position,
  total,
  selected,
  kind,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { key, index, width, height } = item;
  const [result, setResult] = useState<{ id: string; uri: string | null } | null>(null);
  const id = `${sessionId}/${index}/${filter}`;
  const uri = result?.id === id ? result.uri : null;

  useEffect(() => {
    let alive = true;
    const px = Math.min(MAX_THUMB_PX, Math.round(TILE_DP * PixelRatio.get()));
    void imageThumbnail(sessionId, index, px, filter).then((done) => {
      if (alive) setResult({ id, uri: done });
    });
    return () => {
      alive = false;
    };
  }, [sessionId, index, filter, id]);

  const label = kind === 'image' ? 'images.itemA11y' : 'scan.pageA11y';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(label, { n: position, total })}
      accessibilityState={{ selected }}
      onPress={() => onPress(key)}
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: selected ? colors.primary : 'transparent' },
      ]}
    >
      <View style={styles.box}>
        {uri ? (
          <Image
            testID="image-thumb"
            source={{ uri }}
            style={[styles.image, { aspectRatio: width / height }]}
            contentFit="contain"
          />
        ) : (
          <View
            testID="image-placeholder"
            style={[styles.image, { aspectRatio: width / height, backgroundColor: colors.border }]}
          />
        )}
      </View>
      <Text style={{ color: colors.text }}>{position}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { borderRadius: 8, borderWidth: 2, padding: 4, alignItems: 'center', gap: 2 },
  /** Square box: the image keeps its aspect inside it, so tall and wide photos tile evenly. */
  box: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  image: { maxWidth: '100%', maxHeight: '100%' },
});
