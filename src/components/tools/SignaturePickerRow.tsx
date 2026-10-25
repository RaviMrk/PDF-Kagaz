import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSignatures } from '@/stores/signaturesStore';
import { useTheme } from '@/theme/useTheme';
import { formatDate } from '@/utils/date';

type Props = { selectedId: number | null; onSelect(id: number): void };

/** Paper colour behind a signature preview (dark ink on transparency, in any theme). */
const PAPER = '#ffffff';

const drawNew = () => router.push('/signature');

/** The saved signatures as a row of radio tiles, then a Draw new tile (the pad screen). */
export function SignaturePickerRow({ selectedId, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const items = useSignatures((s) => s.items);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.textMuted }}>{t('sign.noSignatures')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sign.drawNew')}
          onPress={drawNew}
          style={[styles.drawButton, { borderColor: colors.primary }]}
        >
          <Text style={[styles.drawLabel, { color: colors.primary }]}>{t('sign.drawNew')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: colors.text }]}>{t('sign.choose')}</Text>
      <ScrollView
        horizontal
        accessibilityRole="radiogroup"
        accessibilityLabel={t('sign.choose')}
        contentContainerStyle={styles.list}
      >
        {items.map((item) => {
          const checked = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityLabel={t('signature.item', {
                date: formatDate(item.createdAt, i18n.language),
              })}
              accessibilityState={{ checked }}
              onPress={() => onSelect(item.id)}
              style={[
                styles.tile,
                { borderColor: checked ? colors.primary : colors.border },
                checked && styles.tileChecked,
              ]}
            >
              <Image
                source={{ uri: item.pngPath }}
                contentFit="contain"
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={styles.preview}
              />
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sign.drawNew')}
          onPress={drawNew}
          style={[styles.tile, styles.drawTile, { borderColor: colors.primary }]}
        >
          <MaterialCommunityIcons name="draw" size={24} color={colors.primary} />
          <Text style={{ color: colors.primary }}>{t('sign.drawNew')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: { fontWeight: '600' },
  list: { gap: 8, paddingVertical: 2 },
  tile: {
    width: 112,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    backgroundColor: PAPER,
    justifyContent: 'center',
  },
  tileChecked: { borderWidth: 3 },
  preview: { width: '100%', height: 52 },
  drawTile: { alignItems: 'center', gap: 2, backgroundColor: 'transparent' },
  empty: { gap: 8, alignItems: 'flex-start' },
  drawButton: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawLabel: { fontSize: 16, fontWeight: '600' },
});
