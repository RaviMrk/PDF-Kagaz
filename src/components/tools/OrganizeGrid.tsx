import { useCallback, type Dispatch } from 'react';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { OrganizePageTile } from '@/components/tools/OrganizePageTile';
import type { PageThumbLoader } from '@/services/reader/pageThumbLoader';
import type { OrganizeAction, OrganizePage } from '@/services/tools/organizeState';

type Props = {
  pages: OrganizePage[];
  loader: PageThumbLoader;
  dispatch: Dispatch<OrganizeAction>;
  /** The scroll view around the grid, for auto-scroll while dragging. */
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
};

const keyOf = (p: OrganizePage) => p.key;

export function OrganizeGrid({ pages, loader, dispatch, scrollableRef }: Props) {
  const renderItem = useCallback(
    ({ item, index }: { item: OrganizePage; index: number }) => (
      <OrganizePageTile page={item} position={index + 1} loader={loader} dispatch={dispatch} />
    ),
    [loader, dispatch],
  );
  const onDragEnd = useCallback(
    ({ data }: { data: OrganizePage[] }) => dispatch({ type: 'reorder', keys: data.map(keyOf) }),
    [dispatch],
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
