import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useEffect, useState, type Dispatch } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { OrganizeAction, OrganizePage } from '@/services/tools/organizeState';
import type { PageThumbLoader } from '@/services/reader/pageThumbLoader';
import { useTheme } from '@/theme/useTheme';

type Props = {
  page: OrganizePage;
  /** 1-based position in the edited document. */
  position: number;
  loader: PageThumbLoader;
  dispatch: Dispatch<OrganizeAction>;
};

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

export const OrganizePageTile = memo(function OrganizePageTile({
  page,
  position,
  loader,
  dispatch,
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

  const label = (name: string) => t(`organize.${name}`, { page: position });
  const button = (name: string, icon: Icon, action: OrganizeAction) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label(name)}
      onPress={() => dispatch(action)}
      style={styles.button}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
    </Pressable>
  );

  return (
    <View style={[styles.tile, { backgroundColor: colors.surface }]}>
      <View
        accessible
        accessibilityLabel={t('organize.pageA11y', { page: position, position })}
        style={styles.thumb}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[styles.image, { transform: [{ rotate: `${rotate}deg` }] }]}
            contentFit="contain"
          />
        ) : (
          <View style={[styles.image, { backgroundColor: colors.border }]} />
        )}
      </View>
      <Text style={{ color: colors.text }}>{label('page')}</Text>
      <View style={styles.actions}>
        {button('rotate', 'rotate-right', { type: 'rotate', key })}
        {button('duplicate', 'content-copy', { type: 'duplicate', key })}
        {button('delete', 'delete-outline', { type: 'delete', key })}
        {button('moveEarlier', 'arrow-left', { type: 'move', key, delta: -1 })}
        {button('moveLater', 'arrow-right', { type: 'move', key, delta: 1 })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { borderRadius: 8, padding: 4, alignItems: 'center', gap: 2 },
  thumb: { width: '100%', aspectRatio: 0.75, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
