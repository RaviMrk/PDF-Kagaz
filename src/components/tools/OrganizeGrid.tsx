import { useCallback } from 'react';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { OrganizePageTile } from '@/components/tools/OrganizePageTile';
import type { PageThumbLoader } from '@/services/reader/pageThumbLoader';
import type { OrganizePage } from '@/services/tools/organizeState';

type Props = {
  pages: OrganizePage[];
  loader: PageThumbLoader;
  selectedKey: string | null;
  onToggle(key: string): void;
  onReorder(keys: string[]): void;
  /** The scroll view around the grid, for auto-scroll while dragging. */
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
};

const keyOf = (p: OrganizePage) => p.key;

export function OrganizeGrid({
  pages,
  loader,
  selectedKey,
  onToggle,
  onReorder,
  scrollableRef,
}: Props) {
  const renderItem = useCallback(
    ({ item, index }: { item: OrganizePage; index: number }) => (
      <OrganizePageTile
        page={item}
        position={index + 1}
        selected={item.key === selectedKey}
        loader={loader}
        onToggle={onToggle}
      />
    ),
    [loader, selectedKey, onToggle],
  );
  const onDragEnd = useCallback(
    ({ data }: { data: OrganizePage[] }) => onReorder(data.map(keyOf)),
    [onReorder],
  );
  return (
    <Sortable.Grid
      columns={3}
      data={pages}
      rowGap={8}
      columnGap={8}
      scrollableRef={scrollableRef}
      keyExtractor={keyOf}
      onDragEnd={onDragEnd}
      renderItem={renderItem}
    />
  );
}
