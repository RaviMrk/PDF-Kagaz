import { useCallback, useState } from 'react';

import type { ImageItem } from '@/services/tools/imageSession';
import { move } from '@/services/tools/reorder';

/** Tap-to-select state for an image list; the selection follows the item by key. */
export function useImageSelection(
  items: ImageItem[],
  onReorder: (keys: string[]) => void,
  onRemove: (key: string) => void,
) {
  const [picked, setPicked] = useState<string | null>(null);
  const at = items.findIndex((i) => i.key === picked);
  const selectedKey = at >= 0 ? picked : null;
  const position = at >= 0 ? at + 1 : null;

  const toggle = useCallback((key: string) => setPicked((k) => (k === key ? null : key)), []);
  const shift = (delta: number) => {
    if (at < 0) return;
    onReorder(
      move(
        items.map((i) => i.key),
        at,
        at + delta,
      ),
    );
  };
  const moveEarlier = () => shift(-1);
  const moveLater = () => shift(1);
  const remove = () => {
    if (selectedKey === null) return;
    setPicked(null);
    onRemove(selectedKey);
  };
  return { selectedKey, position, toggle, moveEarlier, moveLater, remove };
}
