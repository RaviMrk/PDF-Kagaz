import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { BookmarkRow } from '@/db/schema';
import type { OutlineRow } from '@/services/reader/outline';
import { useTheme } from '@/theme/useTheme';

type Props = {
  visible: boolean;
  outline: OutlineRow[];
  bookmarks: BookmarkRow[];
  onGo(page: number): void;
  onRemoveBookmark(id: number): void;
  onClose(): void;
};

type Tab = 'contents' | 'bookmarks';

const keyOfOutline = (r: OutlineRow) => r.key;
const keyOfBookmark = (b: BookmarkRow) => String(b.id);

/** Right-side sheet with the document outline and the file's bookmarks. */
export function ReaderSideSheet({
  visible,
  outline,
  bookmarks,
  onGo,
  onRemoveBookmark,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('contents');

  const go = (page: number) => {
    onGo(page);
    onClose();
  };

  const tabButton = (key: Tab, label: string) => (
    <Pressable
      key={key}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: tab === key }}
      onPress={() => setTab(key)}
      style={[styles.tab, { borderColor: tab === key ? colors.primary : 'transparent' }]}
    >
      <Text style={{ color: tab === key ? colors.primary : colors.text, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );

  const empty = (text: string) => (
    <Text style={[styles.empty, { color: colors.textMuted }]}>{text}</Text>
  );

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={t('reader.close')}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View accessibilityRole="tablist" style={[styles.tabs, { borderColor: colors.border }]}>
            {tabButton('contents', t('reader.contents'))}
            {tabButton('bookmarks', t('reader.bookmarks'))}
          </View>
          {tab === 'contents' ? (
            outline.length === 0 ? (
              empty(t('reader.noContents'))
            ) : (
              <FlashList
                data={outline}
                keyExtractor={keyOfOutline}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}, ${t('reader.bookmarkPage', { page: item.page })}`}
                    onPress={() => go(item.page)}
                    style={[styles.row, { paddingLeft: 16 + 16 * item.depth }]}
                  >
                    <Text numberOfLines={2} style={[styles.rowText, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    <Text style={{ color: colors.textMuted }}>{item.page}</Text>
                  </Pressable>
                )}
              />
            )
          ) : bookmarks.length === 0 ? (
            empty(t('reader.noBookmarks'))
          ) : (
            <FlashList
              data={bookmarks}
              keyExtractor={keyOfBookmark}
              renderItem={({ item }) => (
                <View style={styles.bookmark}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('reader.bookmarkPage', { page: item.page })}
                    onPress={() => go(item.page)}
                    style={[styles.row, styles.rowText]}
                  >
                    <MaterialCommunityIcons name="bookmark" size={20} color={colors.primary} />
                    <Text style={[styles.rowText, { color: colors.text }]}>
                      {t('reader.bookmarkPage', { page: item.page })}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('reader.removeBookmarkFor', { page: item.page })}
                    onPress={() => onRemoveBookmark(item.id)}
                    style={styles.icon}
                  >
                    <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { width: '80%', maxWidth: 360 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
  },
  empty: { padding: 24, textAlign: 'center' },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 16,
  },
  rowText: { flex: 1, fontSize: 16 },
  bookmark: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
