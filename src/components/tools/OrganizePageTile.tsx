import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { OrganizePage } from '@/services/tools/organizeState';
import type { PageThumbLoader } from '@/services/reader/pageThumbLoader';
import { useTheme } from '@/theme/useTheme';

type Props = {
  page: OrganizePage;
  /** 1-based position in the edited document. */
  position: number;
  selected: boolean;
  loader: PageThumbLoader;
  onToggle(key: string): void;
};

export const OrganizePageTile = memo(function OrganizePageTile({
  page,
  position,
  selected,
  loader,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { key, source, rotate } = page;
  const [result, setResult] = useState<{ source: number; uri: string | null } | null>(null);
  const uri = result?.source === source ? result.uri : (loader.get(source) ?? null);

  useEffect(() => {
    let alive = true;
    loader.request(source, (done) => {
      if (alive) setResult({ source, uri: done });
    });
    return () => {
      alive = false;
    };
  }, [loader, source]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('organize.pageA11y', { page: source, position })}
      accessibilityState={{ selected }}
      onPress={() => onToggle(key)}
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: selected ? colors.primary : 'transparent' },
      ]}
    >
      {/* Square box: a page turned 90 or 270 degrees stays inside it. */}
      <View testID="page-thumb" style={styles.thumb}>
        {uri ? (
          <Image
            testID="page-image"
            source={{ uri }}
            style={[styles.image, { transform: [{ rotate: `${rotate}deg` }] }]}
            contentFit="contain"
          />
        ) : (
          <View
            testID="page-image"
            style={[
              styles.image,
              { backgroundColor: colors.border, transform: [{ rotate: `${rotate}deg` }] },
            ]}
          />
        )}
      </View>
      <Text style={{ color: colors.text }}>{t('organize.page', { page: source })}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { borderRadius: 8, borderWidth: 2, padding: 4, alignItems: 'center', gap: 2 },
  thumb: { width: '100%', aspectRatio: 1, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
