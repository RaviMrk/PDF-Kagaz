import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { ImageActionBar } from '@/components/tools/ImageActionBar';
import { ImageFilterControl } from '@/components/tools/ImageFilterControl';
import { ImageGrid } from '@/components/tools/ImageGrid';
import { ImageLayoutOptions } from '@/components/tools/ImageLayoutOptions';
import { RunButton } from '@/components/tools/RunButton';
import { useImageSelection } from '@/components/tools/useImageSelection';
import type { ImageFilter } from '@/services/native/pdfNative';
import type { ImageLayoutOptions as Layout } from '@/services/pdf/imageLayout';
import type { ImageItem } from '@/services/tools/imageSession';
import { IMAGES_MAX } from '@/services/tools/limits';
import { useTheme } from '@/theme/useTheme';

type Props = {
  sessionId: string;
  items: ImageItem[];
  filter: ImageFilter;
  layout: Layout;
  name: string;
  namePlaceholder: string;
  /** An inline message (for example the scanner is unavailable); the pages stay. */
  notice: string | null;
  /** The scanner is open for more pages. */
  scanning: boolean;
  saveDisabled: boolean;
  onFilterChange(f: ImageFilter): void;
  onLayoutChange(v: Layout): void;
  onNameChange(text: string): void;
  onReorder(keys: string[]): void;
  onRemove(key: string): void;
  onScanMore(): void;
  onSave(): void;
};

/** The scanned pages: filter, reorder, scan more, layout and name, then save. */
export function ScanReview({
  sessionId,
  items,
  filter,
  layout,
  name,
  namePlaceholder,
  notice,
  scanning,
  saveDisabled,
  onFilterChange,
  onLayoutChange,
  onNameChange,
  onReorder,
  onRemove,
  onScanMore,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const select = useImageSelection(items, onReorder, onRemove);
  const full = items.length >= IMAGES_MAX;
  const off = full || scanning;
  return (
    <>
      <Animated.ScrollView ref={scrollRef} style={styles.list} contentContainerStyle={styles.body}>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted }}>
          {t('scan.pageCount', { count: items.length })}
        </Text>
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
            {notice}
          </Text>
        ) : null}
        <ImageFilterControl value={filter} onChange={onFilterChange} />
        <ImageGrid
          sessionId={sessionId}
          items={items}
          filter={filter}
          kind="page"
          selectedKey={select.selectedKey}
          onTileToggle={select.toggle}
          onReorder={onReorder}
          scrollableRef={scrollRef}
        />
        {scanning ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textMuted }}>{t('scan.launching')}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scan.more')}
          accessibilityState={{ disabled: off }}
          disabled={off}
          onPress={onScanMore}
          style={[styles.more, { borderColor: colors.primary }, off && styles.dim]}
        >
          <Text style={[styles.label, { color: colors.primary }]}>{t('scan.more')}</Text>
        </Pressable>
        {full ? <Text style={{ color: colors.textMuted }}>{t('scan.limitHint')}</Text> : null}
        <ImageLayoutOptions
          value={layout}
          onChange={onLayoutChange}
          name={name}
          namePlaceholder={namePlaceholder}
          onNameChange={onNameChange}
        />
      </Animated.ScrollView>
      <ImageActionBar
        kind="page"
        selected={select.position}
        total={items.length}
        onEarlier={select.moveEarlier}
        onLater={select.moveLater}
        onRemove={select.remove}
      />
      <RunButton label={t('scan.save')} disabled={saveDisabled || scanning} onPress={onSave} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  body: { gap: 12, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 16, fontWeight: '600' },
  more: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
